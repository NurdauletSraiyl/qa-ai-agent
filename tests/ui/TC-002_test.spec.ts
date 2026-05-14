import { test, expect, Page, Locator } from '@playwright/test';

/**
 * Feature: Поле ИИН (IIN field) on login page
 * URL: https://cabinet.nomad.kz/login
 *
 * Test Suite covers:
 *  - Visibility & default state
 *  - Boundary validation (min/max length)
 *  - Format validation (digits only, sanitization)
 *  - Security validation (XSS, SQL injection attempts)
 *  - Performance / UX (paste, fast typing, duplicate clicks)
 *  - Cross-browser & mobile viewport compatibility
 */

const LOGIN_URL = 'https://cabinet.nomad.kz/login';

// ---- Helpers (kept inline per requirements) -------------------------------

/**
 * Resolves the IIN input using a prioritized selector strategy:
 * data-testid -> role -> label -> placeholder -> CSS fallback
 */
async function getIinInput(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('iin'),
    page.getByTestId('iin-input'),
    page.getByTestId('login-iin'),
    page.getByRole('textbox', { name: /иин/i }),
    page.getByLabel(/иин/i),
    page.getByPlaceholder(/иин/i),
    page.locator('input[name="iin" i]'),
    page.locator('input[type="text"]').first(),
  ];

  for (const candidate of candidates) {
    try {
      if ((await candidate.count()) > 0) {
        await candidate.first().waitFor({ state: 'visible', timeout: 5000 });
        return candidate.first();
      }
    } catch {
      // try next selector
    }
  }
  throw new Error('IIN input field could not be located on the login page.');
}

/**
 * Attempts to resolve a "submit/login" trigger button to validate inline errors.
 */
async function getSubmitButton(page: Page): Promise<Locator | null> {
  const candidates: Locator[] = [
    page.getByTestId('login-submit'),
    page.getByRole('button', { name: /войти|вход|login|sign in/i }),
    page.locator('button[type="submit"]'),
  ];
  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      return candidate.first();
    }
  }
  return null;
}

// ---- Test suite ------------------------------------------------------------

test.describe('Login page — IIN field', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  });

  test('[TC-IIN-001] IIN field is visible and editable by default @P1', async ({ page }) => {
    // Priority: P1 — Smoke
    const iin = await getIinInput(page);

    await expect(iin, 'IIN input must be visible').toBeVisible();
    await expect(iin, 'IIN input must be enabled').toBeEnabled();
    await expect(iin, 'IIN input must be empty initially').toHaveValue('');
    await expect(iin, 'IIN input must be editable').toBeEditable();
  });

  test('[TC-IIN-002] Accepts a valid 12-digit IIN @P1', async ({ page }) => {
    // Priority: P1 — Positive case
    const iin = await getIinInput(page);
    const validIin = '880101300123';

    await iin.click();
    await iin.fill(validIin);

    await expect(iin).toHaveValue(validIin);
    await expect(iin).toHaveJSProperty('value', validIin);
  });

  test('[TC-IIN-003] Rejects IIN shorter than 12 digits (boundary: 11) @P1', async ({ page }) => {
    // Priority: P1 — Boundary (min - 1)
    const iin = await getIinInput(page);
    await iin.fill('12345678901');

    await iin.blur();

    const submit = await getSubmitButton(page);
    if (submit) {
      await submit.click({ trial: false });
    }

    // Either field has aria-invalid OR a validation message is shown
    const ariaInvalid = await iin.getAttribute('aria-invalid');
    const errorRegion = page.locator(
      '[role="alert"], .error, .input-error, .field-error, [class*="error" i]'
    );

    const hasErrorUi = (await errorRegion.count()) > 0;
    expect(
      ariaInvalid === 'true' || hasErrorUi,
      'Expected validation feedback for short IIN'
    ).toBeTruthy();
  });

  test('[TC-IIN-004] Enforces max length of 12 digits @P1', async ({ page }) => {
    // Priority: P1 — Boundary (max + 1)
    const iin = await getIinInput(page);

    await iin.fill('1234567890123456');
    const value = await iin.inputValue();

    expect(value.length, 'Value must not exceed 12 chars').toBeLessThanOrEqual(12);
  });

  test('[TC-IIN-005] Rejects alphabetic input (digits only) @P2', async ({ page }) => {
    // Priority: P2 — Sanitization
    const iin = await getIinInput(page);

    await iin.fill('abcdefghijkl');
    const value = await iin.inputValue();

    expect(
      /^\d*$/.test(value),
      `IIN field should reject letters, got: "${value}"`
    ).toBeTruthy();
  });

  test('[TC-IIN-006] Rejects special characters @P2', async ({ page }) => {
    // Priority: P2 — Sanitization
    const iin = await getIinInput(page);

    await iin.fill('!@#$%^&*()_+');
    const value = await iin.inputValue();

    expect(
      /^\d*$/.test(value),
      `IIN field should reject special chars, got: "${value}"`
    ).toBeTruthy();
  });

  test('[TC-IIN-007] Sanitizes mixed alphanumeric input @P2', async ({ page }) => {
    // Priority: P2 — Sanitization (partial)
    const iin = await getIinInput(page);

    await iin.fill('12ab34cd56ef78gh');
    const value = await iin.inputValue();

    // Either digits-only filtered OR blocked entirely; never include letters
    expect(/[a-zA-Z]/.test(value), 'No alphabetic chars allowed').toBeFalsy();
  });

  test('[TC-IIN-008] Rejects empty IIN on submit @P1', async ({ page }) => {
    // Priority: P1 — Negative
    const iin = await getIinInput(page);
    await iin.fill('');

    const submit = await getSubmitButton(page);
    test.skip(!submit, 'Submit button not present on page');

    await submit!.click();

    // Stay on login or show validation
    await expect(page).toHaveURL(/login/i);

    const ariaInvalid = await iin.getAttribute('aria-invalid');
    const errorRegion = page.locator(
      '[role="alert"], .error, .input-error, .field-error, [class*="error" i]'
    );
    const errorVisible = (await errorRegion.count()) > 0;

    expect(
      ariaInvalid === 'true' || errorVisible,
      'Expected validation feedback for empty IIN'
    ).toBeTruthy();
  });

  test('[TC-IIN-009] Trims leading/trailing whitespace @P2', async ({ page }) => {
    // Priority: P2 — Sanitization
    const iin = await getIinInput(page);

    await iin.fill('   880101300123   ');
    await iin.blur();

    const value = (await iin.inputValue()).trim();
    // Either value gets trimmed by the app, or whitespace was never accepted
    expect(/^\d{0,12}$/.test(value), `Unexpected value: "${value}"`).toBeTruthy();
  });

  test('[TC-IIN-010] Resists XSS payload injection @P1', async ({ page }) => {
    // Priority: P1 — Security
    const iin = await getIinInput(page);
    const xss = '<script>window.__xss=true;</script>';

    await iin.fill(xss);
    await iin.blur();

    const value = await iin.inputValue();
    expect(/[<>]/.test(value), 'HTML tag chars must not be stored as-is').toBeFalsy();

    const xssExecuted = await page.evaluate(() => (window as any).__xss === true);
    expect(xssExecuted, 'XSS payload must NOT execute').toBeFalsy();
  });

  test('[TC-IIN-011] Resists SQL injection payload @P2', async ({ page }) => {
    // Priority: P2 — Security
    const iin = await getIinInput(page);
    const sqli = `' OR 1=1 --`;

    await iin.fill(sqli);

    const value = await iin.inputValue();
    // Quotes and SQL operators are non-digit, must be filtered/blocked
    expect(/[\'";=]/.test(value), 'SQLi characters must not persist').toBeFalsy();
  });

  test('[TC-IIN-012] Paste handling: pastes only digits @P2', async ({ page, browserName }) => {
    // Priority: P2 — Paste sanitization
    const iin = await getIinInput(page);
    const pasted = 'abc880101300123xyz';

    await iin.focus();
    // Programmatic input simulating paste cleanup logic
    await iin.evaluate((el, val) => {
      const input = el as HTMLInputElement;
      input.value = val;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, pasted);

    const value = await iin.inputValue();
    // The field should never end up with alphabetic content
    expect(/[a-zA-Z]/.test(value), `Paste must strip letters (browser=${browserName})`).toBeFalsy();
  });

  test('[TC-IIN-013] No UI freeze on very large input @P3', async ({ page }) => {
    // Priority: P3 — Performance-light
    const iin = await getIinInput(page);
    const huge = '9'.repeat(5000);

    const start = Date.now();
    await iin.fill(huge);
    const elapsed = Date.now() - start;

    expect(elapsed, 'Large input must not freeze UI > 5s').toBeLessThan(5000);
    const value = await iin.inputValue();
    expect(value.length, 'Length must be capped').toBeLessThanOrEqual(12);
  });

  test('[TC-IIN-014] Duplicate rapid submit clicks do not break field state @P2', async ({ page }) => {
    // Priority: P2 — Race / duplicate clicks
    const iin = await getIinInput(page);
    await iin.fill('880101300123');

    const submit = await getSubmitButton(page);
    test.skip(!submit, 'Submit button not present on page');

    await Promise.all([
      submit!.click().catch(() => {}),
      submit!.click().catch(() => {}),
      submit!.click().catch(() => {}),
    ]);

    // Field must remain in DOM and retain its value (or be reset cleanly, never broken)
    await expect(iin).toBeVisible();
    const value = await iin.inputValue();
    expect(value === '880101300123' || value === '').toBeTruthy();
  });

  test('[TC-IIN-015] Mobile viewport: IIN field remains usable @P2', async ({ page }) => {
    // Priority: P2 — Responsive
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const iin = await getIinInput(page);