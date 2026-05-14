import { test, expect, Locator, Page } from '@playwright/test';

const URL = 'https://cabinet.nomad.kz/login';

// Helper: locate IIN input via multiple strategies
const getIinField = (page: Page): Locator => {
  return page.locator(
    [
      '[data-testid="iin-input"]',
      'input[name="iin"]',
      'input[name="IIN"]',
      'input[placeholder*="ИИН" i]',
      'input[type="text"]',
    ].join(', ')
  ).first();
};

// Helper: find associated validation/error message
const getErrorMessage = (page: Page): Locator => {
  return page.locator(
    [
      '[data-testid="iin-error"]',
      '[class*="error" i]',
      '[class*="invalid" i]',
      'text=/неверн|некорректн|обязательн|invalid|required/i',
    ].join(', ')
  ).first();
};

// Helper: locate submit button
const getSubmitButton = (page: Page): Locator => {
  return page
    .getByRole('button', { name: /войти|вход|продолж|login|continue/i })
    .first();
};

test.describe('Login Page — IIN Field Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await expect(getIinField(page)).toBeVisible({ timeout: 15000 });
  });

  // Priority: P0 — Smoke
  test('[TC-IIN-001] IIN field is visible, enabled and empty by default', async ({ page }) => {
    const iin = getIinField(page);
    await expect(iin).toBeVisible();
    await expect(iin).toBeEnabled();
    await expect(iin).toHaveValue('');
    await expect(iin).toBeEditable();
  });

  // Priority: P1 — Boundary: max length (12 digits allowed, extra rejected)
  test('[TC-IIN-002] IIN field accepts exactly 12 digits and rejects overflow', async ({ page }) => {
    const iin = getIinField(page);
    await iin.click();
    await iin.fill('123456789012345'); // attempt 15 chars
    const value = (await iin.inputValue()) || '';
    expect(value.length).toBeLessThanOrEqual(12);
    expect(value).toMatch(/^\d+$/);
  });

  // Priority: P1 — Negative: alphabetic & special chars must be sanitized
  test('[TC-IIN-003] IIN field rejects non-numeric and special characters', async ({ page }) => {
    const iin = getIinField(page);
    await iin.click();
    await iin.fill('abcDEF!@#$%^&*');
    const value = (await iin.inputValue()) || '';
    expect(value).not.toMatch(/[a-zA-Z!@#$%^&*]/);
  });

  // Priority: P1 — Boundary: short IIN (less than 12 digits) shows validation
  test('[TC-IIN-004] Short IIN (<12 digits) triggers validation error', async ({ page }) => {
    const iin = getIinField(page);
    const submit = getSubmitButton(page);

    await iin.fill('12345');
    await iin.blur();

    if (await submit.isVisible().catch(() => false)) {
      await submit.click({ trial: false }).catch(() => {});
    }

    const error = getErrorMessage(page);
    await expect(error).toBeVisible({ timeout: 5000 });
  });

  // Priority: P2 — Security: XSS payload sanitization
  test('[TC-IIN-005] IIN field sanitizes XSS payload', async ({ page }) => {
    const iin = getIinField(page);
    const payload = '<script>alert("xss")</script>';

    let dialogTriggered = false;
    page.on('dialog', async (d) => {
      dialogTriggered = true;
      await d.dismiss().catch(() => {});
    });

    await iin.fill(payload);
    await iin.blur();
    await page.waitForTimeout(500);

    const value = (await iin.inputValue()) || '';
    expect(dialogTriggered).toBe(false);
    expect(value).not.toContain('<script>');
    expect(value).not.toContain('</script>');
  });

  // Priority: P2 — Security: SQL injection sanitization
  test('[TC-IIN-006] IIN field sanitizes SQL injection payload', async ({ page }) => {
    const iin = getIinField(page);
    await iin.fill("' OR '1'='1");
    const value = (await iin.inputValue()) || '';
    expect(value).not.toMatch(/['"=]/);
    await expect(iin).toBeEnabled();
  });

  // Priority: P2 — Performance: large input does not freeze UI
  test('[TC-IIN-007] IIN field handles large input without UI freeze', async ({ page }) => {
    const iin = getIinField(page);
    const large = '9'.repeat(5000);

    const start = Date.now();
    await iin.fill(large);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    const value = (await iin.inputValue()) || '';
    expect(value.length).toBeLessThanOrEqual(12);
    await expect(iin).toBeEnabled();
  });
});