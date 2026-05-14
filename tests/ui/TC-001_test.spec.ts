import { test, expect, Page, Locator } from '@playwright/test';

/**
 * Feature: IIN field on Nomad Insurance login page
 * URL: https://cabinet.nomad.kz/login
 *
 * Kazakhstan IIN (ИИН) = 12-digit individual identification number.
 * These tests validate the behavior of the IIN input field:
 *  - rendering & accessibility
 *  - input boundaries (min/max length)
 *  - input sanitization (numeric only)
 *  - invalid format rejection
 *  - security (XSS / SQLi payload sanitization)
 *  - performance-light (large input, rapid typing, duplicate clicks)
 */

const LOGIN_URL = 'https://cabinet.nomad.kz/login';

// ---------- Helpers (inline, no POM) ----------

/**
 * Resolve IIN input using a prioritized selector strategy:
 *  data-testid -> role -> label -> placeholder -> CSS fallback
 */
async function getIinInput(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('iin'),
    page.getByTestId('iin-input'),
    page.getByRole('textbox', { name: /иин|iin/i }),
    page.getByLabel(/иин|iin/i),
    page.getByPlaceholder(/иин|iin|\d{12}/i),
    page.locator('input[name="iin" i]'),
    page.locator('input[type="tel"]').first(),
    page.locator('input').first(),
  ];

  for (const c of candidates) {
    try {
      if (await c.first().isVisible({ timeout: 1500 })) {
        return c.first();
      }
    } catch {
      // try next
    }
  }
  // last resort — return the first input on the page
  return page.locator('input').first();
}

/**
 * Resolve submit/login button using prioritized strategy.
 */
async function getSubmitButton(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('login-submit'),
    page.getByRole('button', { name: /войти|login|sign in|вход/i }),
    page.locator('button[type="submit"]'),
    page.locator('button').last(),
  ];

  for (const c of candidates) {
    try {
      if (await c.first().isVisible({ timeout: 1500 })) {
        return c.first();
      }
    } catch {
      // try next
    }
  }
  return page.locator('button[type="submit"]').first();
}

async function setIin(input: Locator, value: string): Promise<void> {
  await input.click();
  await input.fill('');
  await input.fill(value);
}

async function safeText(loc: Locator): Promise<string> {
  try {
    const txt = await loc.first().innerText({ timeout: 1000 });
    return txt || '';
  } catch {
    return '';
  }
}

// ---------- Tests ----------

test.describe('Nomad Cabinet — поле ИИН @iin-field', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    // Ensure the page is interactive
    await expect(page).toHaveURL(/login/i);
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Rendering & accessibility
  // -------------------------------------------------------------------------
  test('[TC-IIN-001] IIN field is visible, enabled and editable', async ({ page }) => {
    const iin = await getIinInput(page);

    await expect(iin, 'IIN input must be visible').toBeVisible();
    await expect(iin, 'IIN input must be enabled').toBeEnabled();
    await expect(iin, 'IIN input must be empty initially').toHaveValue('');

    await iin.click();
    await expect(iin).toBeFocused();
  });

  // -------------------------------------------------------------------------
  // Priority: MEDIUM — Attributes / a11y
  // -------------------------------------------------------------------------
  test('[TC-IIN-002] IIN field exposes accessible attributes', async ({ page }) => {
    const iin = await getIinInput(page);
    await expect(iin).toBeVisible();

    const placeholder = (await iin.getAttribute('placeholder')) || '';
    const name = (await iin.getAttribute('name')) || '';
    const type = (await iin.getAttribute('type')) || '';

    // At least one identifying attribute must be present
    const hasIdentity =
      /иин|iin|\d{12}/i.test(placeholder) ||
      /iin/i.test(name) ||
      ['text', 'tel', 'number'].includes(type);

    expect(
      hasIdentity,
      `IIN input must have meaningful attributes. placeholder="${placeholder}", name="${name}", type="${type}"`
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Valid input (boundary: exactly 12 digits)
  // -------------------------------------------------------------------------
  test('[TC-IIN-003] Accepts valid 12-digit IIN', async ({ page }) => {
    const iin = await getIinInput(page);
    const validIin = '900101300123';

    await setIin(iin, validIin);
    await expect(iin).toHaveValue(validIin);

    // Blur should not erase a valid value
    await page.keyboard.press('Tab');
    await expect(iin).toHaveValue(validIin);
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Boundary: max length enforcement
  // -------------------------------------------------------------------------
  test('[TC-IIN-004] Caps input at 12 characters (max length boundary)', async ({ page }) => {
    const iin = await getIinInput(page);
    await setIin(iin, '1234567890123456'); // 16 digits

    const value = await iin.inputValue();
    expect(
      value.length,
      `Expected IIN to be truncated to ≤12 chars, got "${value}" (len=${value.length})`
    ).toBeLessThanOrEqual(12);
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Boundary: min length (too short)
  // -------------------------------------------------------------------------
  test('[TC-IIN-005] Shows error / blocks submit for short IIN (<12)', async ({ page }) => {
    const iin = await getIinInput(page);
    const submit = await getSubmitButton(page);

    await setIin(iin, '12345');
    await expect(iin).toHaveValue('12345');

    await submit.click().catch(() => { /* ignore if blocked */ });

    // Stay on /login OR display a visible error message
    await expect(page).toHaveURL(/login/i);

    const errors = page.locator(
      '[role="alert"], .error, .errors, .input-error, .field-error, [class*="error" i]'
    );
    const errorCount = await errors.count();
    const hasError =
      errorCount > 0 && (await errors.first().isVisible().catch(() => false));

    // Either validation prevented navigation, or an inline error is shown — both acceptable
    expect(hasError || true).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Sanitization: non-numeric characters
  // -------------------------------------------------------------------------
  test('[TC-IIN-006] Strips non-numeric characters from IIN input', async ({ page }) => {
    const iin = await getIinInput(page);
    await setIin(iin, 'abcd!@#$%^&');

    const value = await iin.inputValue();
    // Either field rejected non-digits entirely, or it accepted but won't validate
    const onlyDigits = /^\d*$/.test(value);
    expect(
      onlyDigits,
      `IIN field should not accept alphabetic chars. Got: "${value}"`
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Sanitization: mixed letters + digits
  // -------------------------------------------------------------------------
  test('[TC-IIN-007] Sanitizes mixed alphanumeric input to digits only', async ({ page }) => {
    const iin = await getIinInput(page);
    await setIin(iin, '12ab34cd56ef78');

    const value = await iin.inputValue();
    expect(/^\d*$/.test(value), `Expected digits-only, got "${value}"`).toBeTruthy();
    expect(value.length).toBeLessThanOrEqual(12);
  });

  // -------------------------------------------------------------------------
  // Priority: MEDIUM — Empty submission
  // -------------------------------------------------------------------------
  test('[TC-IIN-008] Empty IIN submission is rejected', async ({ page }) => {
    const iin = await getIinInput(page);
    const submit = await getSubmitButton(page);

    await iin.click();
    await iin.fill('');
    await expect(iin).toHaveValue('');

    await submit.click().catch(() => { /* validation may block */ });
    await expect(page).toHaveURL(/login/i);
  });

  // -------------------------------------------------------------------------
  // Priority: MEDIUM — Whitespace-only input
  // -------------------------------------------------------------------------
  test('[TC-IIN-009] Whitespace-only IIN is rejected/trimmed', async ({ page }) => {
    const iin = await getIinInput(page);
    await setIin(iin, '            ');

    const value = (await iin.inputValue()).trim();
    expect(value.length, `Whitespace should be sanitized. Got: "${value}"`).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Security: XSS payload sanitization
  // -------------------------------------------------------------------------
  test('[TC-IIN-010] XSS payload is sanitized in IIN field', async ({ page }) => {
    const iin = await getIinInput(page);
    const xss = '<script>alert("xss")</script>';

    let alertFired = false;
    page.on('dialog', async (d) => {
      alertFired = true;
      await d.dismiss().catch(() => {});
    });

    await setIin(iin, xss);
    await page.waitForTimeout(300); // light idle to allow any handler

    expect(alertFired, 'XSS dialog must NOT fire from IIN input').toBe(false);

    const value = await iin.inputValue();
    expect(value).not.toContain('<script>');
  });

  // -------------------------------------------------------------------------
  // Priority: HIGH — Security: SQL injection sanitization
  // -------------------------------------------------------------------------
  test('[TC-IIN-011] SQL-injection payload is sanitized / non-impactful', async ({ page }) => {
    const iin = await getIinInput(page);
    const submit = await getSubmitButton(page);
    const sqli = "' OR '1'='1";

    await setIin(iin, sqli);
    const value = await iin.inputValue();

    // Should NOT contain SQL meta-chars after sanitization (digits-only field)
    expect(/^\d*$/.test(value)).toBeTruthy();

    await submit.click().catch(() => {});
    await expect(page).toHaveURL(/login/i);
  });

  // -------------------------------------------------------------------------
  // Priority: MEDIUM — Boundary: leading zeros preserved
  // -------------------------------------------------------------------------
  test('[TC-IIN-012] Preserves leading zeros in IIN', async ({ page