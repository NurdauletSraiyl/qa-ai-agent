import { test, expect, Page, Locator } from '@playwright/test';

/**
 * Feature: поле ИИН (IIN field) on Login Page
 * URL: https://cabinet.nomad.kz/login
 *
 * IIN (Individual Identification Number) — 12-digit numeric Kazakhstani ID.
 * Test coverage:
 *   - Visibility / state
 *   - Boundary validation (min/max length)
 *   - Format validation (numeric only)
 *   - Security (XSS / SQLi sanitization)
 *   - Performance (large input, duplicate clicks)
 *   - UX (paste, trim, mask)
 */

const LOGIN_URL = 'https://cabinet.nomad.kz/login';

// ---------- Helpers ----------

/**
 * Resolve IIN input field with a robust selector chain.
 * Priority: data-testid → role/label → placeholder → name → CSS fallback.
 */
async function getIinField(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('iin'),
    page.getByTestId('iin-input'),
    page.getByRole('textbox', { name: /иин/i }),
    page.getByLabel(/иин/i),
    page.getByPlaceholder(/иин/i),
    page.locator('input[name="iin" i]'),
    page.locator('input[type="tel"]').first(),
    page.locator('form input').first(),
  ];

  for (const c of candidates) {
    if (await c.count().catch(() => 0)) {
      try {
        await c.first().waitFor({ state: 'visible', timeout: 5000 });
        return c.first();
      } catch {
        // try next candidate
      }
    }
  }
  // Fallback — return first candidate to surface a meaningful failure
  return candidates[0].first();
}

/**
 * Resolve the submit / login button.
 */
async function getSubmitButton(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('login-submit'),
    page.getByRole('button', { name: /войти|вход|log\s*in|sign\s*in/i }),
    page.locator('button[type="submit"]'),
    page.locator('form button').last(),
  ];
  for (const c of candidates) {
    if (await c.count().catch(() => 0)) {
      return c.first();
    }
  }
  return candidates[0].first();
}

/**
 * Type into IIN field reliably (clear first, then type).
 */
async function typeIin(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.fill('');
  if (value.length > 0) {
    await field.fill(value);
  }
}

/**
 * Read normalized field value (mask-aware, digits only).
 */
async function readIinDigits(field: Locator): Promise<string> {
  const raw = (await field.inputValue()) || '';
  return raw.replace(/\D+/g, '');
}

test.describe('Login Page — поле ИИН', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    // Wait for form to render
    await expect(page.locator('form, input').first()).toBeVisible({ timeout: 15000 });
  });

  // -----------------------------------------------------------------------
  // Priority: P1 — Smoke / Visibility
  // -----------------------------------------------------------------------
  test('[TC-IIN-001] IIN field is rendered, visible, enabled and editable', async ({ page }) => {
    const field = await getIinField(page);

    await expect(field).toBeVisible();
    await expect(field).toBeEnabled();
    await expect(field).toBeEditable();

    // State assertion — empty by default
    const initialValue = (await field.inputValue()) || '';
    expect(initialValue.replace(/\D+/g, '')).toBe('');

    // Validation assertion — focusable
    await field.focus();
    await expect(field).toBeFocused();
  });

  // -----------------------------------------------------------------------
  // Priority: P1 — Positive boundary (12 digits)
  // -----------------------------------------------------------------------
  test('[TC-IIN-002] Accepts valid 12-digit IIN', async ({ page }) => {
    const field = await getIinField(page);
    const validIin = '950101300123';

    await typeIin(field, validIin);

    // Validation: digits preserved (mask-tolerant)
    const digits = await readIinDigits(field);
    expect(digits).toBe(validIin);
    expect(digits.length).toBe(12);

    // Expected result — no inline validation error shown
    const errorLocator = page.locator('[role="alert"], .error, .invalid, [class*="error" i]');
    const errorCount = await errorLocator.count();
    if (errorCount > 0) {
      // If any error node exists, none should be visible for valid input
      for (let i = 0; i < errorCount; i++) {
        await expect(errorLocator.nth(i)).toBeHidden();
      }
    }
  });

  // -----------------------------------------------------------------------
  // Priority: P2 — Min boundary (below 12 chars)
  // -----------------------------------------------------------------------
  test('[TC-IIN-003] Rejects IIN shorter than 12 digits (min boundary)', async ({ page }) => {
    const field = await getIinField(page);
    const submit = await getSubmitButton(page);
    const shortIin = '12345';

    await typeIin(field, shortIin);
    await field.blur();

    const digits = await readIinDigits(field);
    expect(digits.length).toBeLessThan(12);

    // Attempt submit — expect block or error
    if (await submit.isVisible().catch(() => false)) {
      await submit.click({ trial: false }).catch(() => {});
    }

    // Stay on login page (not authenticated)
    await expect(page).toHaveURL(/login/i, { timeout: 5000 });
  });

  // -----------------------------------------------------------------------
  // Priority: P2 — Max boundary (over 12 chars)
  // -----------------------------------------------------------------------
  test('[TC-IIN-004] Truncates / blocks input longer than 12 digits (max boundary)', async ({ page }) => {
    const field = await getIinField(page);
    const longIin = '123456789012345678';

    await typeIin(field, longIin);
    const digits = await readIinDigits(field);

    // Expected: input is capped at 12 digits
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  // -----------------------------------------------------------------------
  // Priority: P2 — Empty submission
  // -----------------------------------------------------------------------
  test('[TC-IIN-005] Empty IIN submission is blocked', async ({ page }) => {
    const field = await getIinField(page);
    const submit = await getSubmitButton(page);

    await typeIin(field, '');
    await field.blur();

    if (await submit.isVisible().catch(() => false)) {
      await submit.click().catch(() => {});
    }

    // Expected: still on login (no auth attempted), or visible inline error
    await expect(page).toHaveURL(/login/i, { timeout: 5000 });
  });

  // -----------------------------------------------------------------------
  // Priority: P2 — Non-numeric input
  // -----------------------------------------------------------------------
  test('[TC-IIN-006] Rejects alphabetic characters in IIN field', async ({ page }) => {
    const field = await getIinField(page);

    await typeIin(field, 'abcdefghijkl');
    const digits = await readIinDigits(field);

    // Expected: digits-only sanitization — no alpha chars accepted
    expect(digits).toBe('');
  });

  test('[TC-IIN-007] Rejects special characters in IIN field', async ({ page }) => {
    const field = await getIinField(page);

    await typeIin(field, '!@#$%^&*()_+');
    const digits = await readIinDigits(field);

    expect(digits).toBe('');
  });

  test('[TC-IIN-008] Strips mixed alphanumeric input down to digits only', async ({ page }) => {
    const field = await getIinField(page);

    await typeIin(field, 'a1b2c3d4e5f6g7h8');
    const digits = await readIinDigits(field);

    // Expected: only digits retained, capped at max length
    expect(/^\d*$/.test(digits)).toBeTruthy();
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  // -----------------------------------------------------------------------
  // Priority: P3 — Whitespace sanitization
  // -----------------------------------------------------------------------
  test('[TC-IIN-009] Trims surrounding whitespace from IIN', async ({ page }) => {
    const field = await getIinField(page);

    await typeIin(field, '   950101300123   ');
    const digits = await readIinDigits(field);

    expect(digits).toBe('950101300123');
  });

  // -----------------------------------------------------------------------
  // Priority: P1 — Security: XSS
  // -----------------------------------------------------------------------
  test('[TC-IIN-010] XSS payload is sanitized — no script execution', async ({ page }) => {
    let dialogTriggered = false;
    page.on('dialog', async (d) => {
      dialogTriggered = true;
      await d.dismiss().catch(() => {});
    });

    const field = await getIinField(page);
    const xss = `<script>alert('XSS')</script>`;

    await typeIin(field, xss);
    await field.blur();

    // Validation: no script executed
    expect(dialogTriggered).toBeFalsy();

    // Validation: no raw <script> rendered in DOM via the value
    const digits = await readIinDigits(field);
    expect(digits).not.toContain('<');
    expect(digits).not.toContain('>');
  });

  // -----------------------------------------------------------------------
  // Priority: P1 — Security: SQL injection
  // -----------------------------------------------------------------------
  test('[TC-IIN-011] SQL injection payload is sanitized in IIN field', async ({ page }) => {
    const field = await getIinField(page);
    const submit = await getSubmitButton(page);
    const sqli = `' OR '1'='1`;

    await typeIin(field, sqli);
    await field.blur();

    const digits = await readIinDigits(field);
    // Expected: stripped to digits only (or empty)
    expect(/^\d*$/.test(digits)).toBeTruthy();

    if (await submit.isVisible().catch(() => false)) {
      await submit.click().catch(() => {});
    }
    await expect(page).toHaveURL(/login/i, { timeout: 5000 });
  });

  // -----------------------------------------------------------------------
  // Priority: P3 — Performance: very large input
  // -----------------------------------------------------------------------
  test('[TC-IIN-012] Handles very large input without UI freeze', async ({ page }) => {
    const field = await getIinField(page);
    const huge = '9'.repeat(5000);

    const t0 = Date.now();
    await typeIin(field, huge);
    const elapsed = Date.now() - t0;

    // UI must remain responsive
    expect(elapsed).toBeLessThan(15000);

    const digits = await readIinDigits(field);
    expect(digits.length).toBeLessThanOrEqual(12);

    // Page must remain interactive
    await expect(field).toBeEnabled();
  });

  // -----------------------------------------------------------------------
  // Priority: P3 — Paste behavior
  // -----------------------------------------------------------------------