import { test, expect, Page, Locator } from '@playwright/test';

/**
 * Feature: Поле ИИН (IIN field) on Login Page
 * URL: https://cabinet.nomad.kz/login
 *
 * IIN (ИИН) — Kazakhstan Individual Identification Number
 * Format: exactly 12 digits, numeric only
 *
 * Test Coverage:
 *  - Visibility / rendering
 *  - Boundary length (min/max)
 *  - Invalid characters (letters, symbols, spaces)
 *  - Security (XSS / SQL injection sanitization)
 *  - Performance (large input, debounce, duplicate clicks)
 *  - Cross-browser & mobile viewport friendly
 */

const LOGIN_URL = 'https://cabinet.nomad.kz/login';

// ---------- Reusable inline helpers ----------

/**
 * Resilient locator resolution for the IIN input.
 * Priority: data-testid → role(textbox) by name → label → placeholder → name attr → CSS fallback
 */
async function getIinField(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('iin'),
    page.getByTestId('iin-input'),
    page.getByRole('textbox', { name: /иин/i }),
    page.getByLabel(/иин/i),
    page.getByPlaceholder(/иин/i),
    page.locator('input[name="iin" i]'),
    page.locator('input[name*="iin" i]'),
    page.locator('input[type="text"]').first(),
  ];

  for (const candidate of candidates) {
    const count = await candidate.count().catch(() => 0);
    if (count > 0) {
      const first = candidate.first();
      if (await first.isVisible().catch(() => false)) {
        return first;
      }
    }
  }
  // Fallback — return first candidate even if not visible, test will fail with clear assertion
  return candidates[0];
}

/**
 * Try to locate the submit/login button using stable strategies.
 */
async function getSubmitButton(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('login-submit'),
    page.getByTestId('submit'),
    page.getByRole('button', { name: /войти|login|sign in|вход/i }),
    page.locator('button[type="submit"]'),
  ];
  for (const c of candidates) {
    if ((await c.count().catch(() => 0)) > 0) return c.first();
  }
  return candidates[candidates.length - 1];
}

/**
 * Clear field safely without relying on .clear() flakiness.
 */
async function safeClear(field: Locator): Promise<void> {
  await field.click();
  await field.press('Control+A');
  await field.press('Delete');
  // Fallback for macOS / WebKit
  const value = await field.inputValue().catch(() => '');
  if (value && value.length > 0) {
    await field.fill('');
  }
}

test.describe('Поле ИИН — Login Page (cabinet.nomad.kz)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    // Wait for app hydration (any input visible)
    await expect(page.locator('input').first()).toBeVisible({ timeout: 15000 });
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-001 — Field is visible and interactable
  // Priority: P0 (Smoke / Critical)
  // ---------------------------------------------------------------------------
  test('[TC-IIN-001] ИИН field renders and is interactable', async ({ page }) => {
    const iin = await getIinField(page);

    await expect(iin, 'ИИН input must be visible on login page').toBeVisible();
    await expect(iin, 'ИИН input must be enabled').toBeEnabled();
    await expect(iin, 'ИИН input must be editable').toBeEditable();

    await iin.click();
    await expect(iin, 'ИИН input should be focused on click').toBeFocused();
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-002 — Valid 12-digit IIN is accepted
  // Priority: P0
  // ---------------------------------------------------------------------------
  test('[TC-IIN-002] Valid 12-digit ИИН is accepted', async ({ page }) => {
    const iin = await getIinField(page);
    const valid = '950512300123';

    await iin.fill(valid);
    await expect(iin).toHaveValue(valid);
    expect((await iin.inputValue()).length, 'Stored value should be exactly 12 chars').toBe(12);
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-003 — Boundary: empty submission shows validation
  // Priority: P1
  // ---------------------------------------------------------------------------
  test('[TC-IIN-003] Empty ИИН submission triggers validation', async ({ page }) => {
    const iin = await getIinField(page);
    const submit = await getSubmitButton(page);

    await safeClear(iin);
    await iin.blur();

    if ((await submit.count()) > 0 && (await submit.isVisible().catch(() => false))) {
      await submit.click({ trial: false }).catch(() => { /* ignore */ });
    }

    // Expect either HTML5 invalidity or a visible inline error
    const isInvalid = await iin.evaluate((el: HTMLInputElement) =>
      typeof el.checkValidity === 'function' ? !el.checkValidity() : false
    );

    const errorVisible = await page
      .locator('text=/обязательн|required|введите|укажите|заполни/i')
      .first()
      .isVisible()
      .catch(() => false);

    expect(isInvalid || errorVisible, 'Empty IIN must produce validation feedback').toBeTruthy();
    // URL must not change — login should not proceed
    await expect(page).toHaveURL(/login/i);
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-004 — Boundary: 11 digits (below min length) rejected
  // Priority: P1
  // ---------------------------------------------------------------------------
  test('[TC-IIN-004] 11-digit ИИН (below minimum) is rejected', async ({ page }) => {
    const iin = await getIinField(page);
    const tooShort = '12345678901';

    await iin.fill(tooShort);
    await iin.blur();

    const value = await iin.inputValue();
    expect(value.length, 'Field should not contain 12+ chars').toBeLessThan(12);

    const submit = await getSubmitButton(page);
    if ((await submit.count()) > 0 && (await submit.isVisible().catch(() => false))) {
      await submit.click().catch(() => { /* ignore */ });
    }
    await expect(page).toHaveURL(/login/i);
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-005 — Boundary: 13+ digits cannot exceed 12
  // Priority: P1
  // ---------------------------------------------------------------------------
  test('[TC-IIN-005] ИИН input enforces maxlength = 12', async ({ page }) => {
    const iin = await getIinField(page);
    const tooLong = '1234567890123456';

    await iin.fill(tooLong);
    const value = await iin.inputValue();

    expect(value.length, 'Field must not allow more than 12 characters').toBeLessThanOrEqual(12);
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-006 — Invalid input: letters are filtered or rejected
  // Priority: P1
  // ---------------------------------------------------------------------------
  test('[TC-IIN-006] ИИН rejects alphabetic characters', async ({ page }) => {
    const iin = await getIinField(page);
    await safeClear(iin);

    await iin.pressSequentially('abcdEFGHzzzz', { delay: 20 });
    const value = await iin.inputValue();

    // Either the field stays empty, or it filters to digits only
    expect(/^\d*$/.test(value), `Value should contain only digits, got "${value}"`).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-007 — Invalid input: special characters / symbols rejected
  // Priority: P2
  // ---------------------------------------------------------------------------
  test('[TC-IIN-007] ИИН rejects special characters and symbols', async ({ page }) => {
    const iin = await getIinField(page);
    await safeClear(iin);

    await iin.pressSequentially('!@#$%^&*()_+', { delay: 20 });
    const value = await iin.inputValue();

    expect(/^\d*$/.test(value), `Symbols must be filtered, got "${value}"`).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-008 — Invalid input: spaces are stripped or blocked
  // Priority: P2
  // ---------------------------------------------------------------------------
  test('[TC-IIN-008] ИИН strips or blocks whitespace', async ({ page }) => {
    const iin = await getIinField(page);
    await safeClear(iin);

    await iin.fill('  950512 300 123  ');
    const value = (await iin.inputValue()).trim();

    expect(value.includes(' '), 'Final stored value should not contain spaces').toBeFalsy();
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-009 — Security: XSS payload is sanitized
  // Priority: P0 (Security)
  // ---------------------------------------------------------------------------
  test('[TC-IIN-009] ИИН sanitizes XSS payload', async ({ page }) => {
    let dialogTriggered = false;
    page.on('dialog', async (d) => {
      dialogTriggered = true;
      await d.dismiss();
    });

    const iin = await getIinField(page);
    const xss = '<script>alert("XSS")</script>';

    await safeClear(iin);
    await iin.fill(xss);
    await iin.blur();

    const submit = await getSubmitButton(page);
    if ((await submit.count()) > 0 && (await submit.isVisible().catch(() => false))) {
      await submit.click().catch(() => { /* ignore */ });
    }

    // No script execution
    expect(dialogTriggered, 'XSS payload must NOT execute').toBeFalsy();

    // No injected <script> from this input in DOM
    const scriptInjected = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      return scripts.some((s) => (s.textContent || '').includes('alert("XSS")'));
    });
    expect(scriptInjected, 'Payload must not be injected as <script>').toBeFalsy();

    const value = await iin.inputValue();
    expect(/^\d*$/.test(value) || value.length === 0, 'Sanitized value should be digits only or empty').toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // TC-IIN-010 — Security: SQL injection payload is treated as plain input
  // Priority: P0 (Security)
  // ---------------------------------------------------------------------------
  test('[TC-IIN-010] ИИН handles SQL injection input safely', async ({ page }) => {
    const iin = await getIinField(page);
    const sqli = `' OR '1'='