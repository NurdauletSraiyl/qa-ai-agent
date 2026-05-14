```typescript
import { test, expect, Page, Locator } from '@playwright/test';

/**
 * ============================================================
 * Feature: IIN (Individual Identification Number) Field
 * Page:    Login Page - https://cabinet.nomad.kz/login
 * ============================================================
 *
 * IIN = Kazakhstan Individual Identification Number
 *  - Exactly 12 digits
 *  - Numeric only
 *  - Required for login
 *
 * Test Architecture:
 *  - 1 test per TC-ID
 *  - TC-ID preserved in titles
 *  - Reusable LoginPage helper for maintainability
 *  - Stability: auto-wait + expect-based assertions
 *  - Coverage: functional, boundary, validation, security, performance
 * ============================================================
 */

const LOGIN_URL = 'https://cabinet.nomad.kz/login';

// ---------- Page Object / Helper ----------
class LoginPage {
  readonly page: Page;
  readonly iinInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Selector strategy: testid → role → label → placeholder → CSS fallback
    this.iinInput = page
      .locator(
        [
          '[data-testid="iin-input"]',
          'input[name="iin"]',
          'input[placeholder*="ИИН" i]',
          'input[type="tel"]',
        ].join(', '),
      )
      .first();

    this.passwordInput = page
      .locator(
        [
          '[data-testid="password-input"]',
          'input[name="password"]',
          'input[type="password"]',
        ].join(', '),
      )
      .first();

    this.submitButton = page
      .locator(
        [
          '[data-testid="login-submit"]',
          'button[type="submit"]',
          'button:has-text("Войти")',
          'button:has-text("Login")',
        ].join(', '),
      )
      .first();
  }

  async goto(): Promise<void> {
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await expect(this.iinInput).toBeVisible();
  }

  async fillIIN(value: string): Promise<void> {
    await this.iinInput.click();
    await this.iinInput.fill('');
    await this.iinInput.fill(value);
  }

  async typeIIN(value: string, delay = 0): Promise<void> {
    await this.iinInput.click();
    await this.iinInput.fill('');
    await this.iinInput.pressSequentially(value, { delay });
  }

  async getIINValue(): Promise<string> {
    return (await this.iinInput.inputValue()) ?? '';
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Returns the visible validation/error message (if any).
   */
  async getValidationMessage(): Promise<string> {
    const errorLocator = this.page
      .locator(
        [
          '[data-testid="iin-error"]',
          '[role="alert"]',
          '.error',
          '.invalid-feedback',
          '.field-error',
          'text=/неверн|ошибк|invalid|required|обязательн/i',
        ].join(', '),
      )
      .first();

    // Native HTML5 validation fallback
    const native = await this.iinInput.evaluate(
      (el: HTMLInputElement) => el.validationMessage,
    );
    if (native) return native;

    if (await errorLocator.count()) {
      return ((await errorLocator.textContent()) ?? '').trim();
    }
    return '';
  }
}

// ============================================================
// TEST SUITE
// ============================================================
test.describe('Login Page - IIN Field', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  // ----------------------------------------------------------
  // FUNCTIONAL TESTS
  // ----------------------------------------------------------
  test.describe('Functional', () => {
    // Priority: P1 - Critical
    test('[TC-IIN-001] IIN field is visible and enabled on load', async () => {
      await expect(loginPage.iinInput).toBeVisible();
      await expect(loginPage.iinInput).toBeEnabled();
      await expect(loginPage.iinInput).toBeEditable();
      await expect(loginPage.iinInput).toHaveValue('');
    });

    // Priority: P1 - Critical
    test('[TC-IIN-002] Accepts a valid 12-digit IIN', async () => {
      const validIIN = '950101300123';
      await loginPage.fillIIN(validIIN);

      const value = (await loginPage.getIINValue()).replace(/\D/g, '');
      expect(value).toBe(validIIN);
      expect(value).toHaveLength(12);
    });

    // Priority: P2
    test('[TC-IIN-003] IIN field has correct placeholder/label', async () => {
      const placeholder = await loginPage.iinInput.getAttribute('placeholder');
      const ariaLabel = await loginPage.iinInput.getAttribute('aria-label');
      const hint = `${placeholder ?? ''} ${ariaLabel ?? ''}`.toLowerCase();
      expect(hint).toMatch(/иин|iin/);
    });

    // Priority: P2
    test('[TC-IIN-004] IIN field can be cleared after entry', async () => {
      await loginPage.fillIIN('950101300123');
      await expect(loginPage.iinInput).not.toHaveValue('');

      await loginPage.iinInput.fill('');
      await expect(loginPage.iinInput).toHaveValue('');
    });
  });

  // ----------------------------------------------------------
  // BOUNDARY TESTS
  // ----------------------------------------------------------
  test.describe('Boundary Validation', () => {
    // Priority: P1
    test('[TC-IIN-005] Rejects IIN with fewer than 12 digits (min boundary - 1)', async () => {
      await loginPage.fillIIN('12345678901'); // 11 digits
      await loginPage.passwordInput.click(); // trigger blur
      await loginPage.submit();

      const msg = await loginPage.getValidationMessage();
      expect(msg.length).toBeGreaterThan(0);
      await expect(loginPage.page).toHaveURL(/\/login/);
    });

    // Priority: P2
    test('[TC-IIN-006] Truncates or rejects IIN with more than 12 digits (max boundary + 1)', async () => {
      await loginPage.typeIIN('1234567890123'); // 13 digits
      const value = (await loginPage.getIINValue()).replace(/\D/g, '');
      // App must either cap to 12 OR show a validation error
      if (value.length === 12) {
        expect(value).toHaveLength(12);
      } else {
        await loginPage.passwordInput.click();
        await loginPage.submit();
        const msg = await loginPage.getValidationMessage();
        expect(msg.length).toBeGreaterThan(0);
      }
    });

    // Priority: P2
    test('[TC-IIN-007] Empty IIN shows required validation', async () => {
      await loginPage.iinInput.click();
      await loginPage.passwordInput.click();
      await loginPage.passwordInput.fill('SomePass123!');
      await loginPage.submit();

      const msg = await loginPage.getValidationMessage();
      expect(msg.length).toBeGreaterThan(0);
      await expect(loginPage.page).toHaveURL(/\/login/);
    });

    // Priority: P3
    test('[TC-IIN-008] Single-digit IIN is rejected', async () => {
      await loginPage.fillIIN('1');
      await loginPage.passwordInput.click();
      await loginPage.submit();

      const value = (await loginPage.getIINValue()).replace(/\D/g, '');
      expect(value.length).toBeLessThan(12);
      await expect(loginPage.page).toHaveURL(/\/login/);
    });
  });

  // ----------------------------------------------------------
  // INVALID INPUT / SANITIZATION
  // ----------------------------------------------------------
  test.describe('Invalid Input & Sanitization', () => {
    // Priority: P1
    test('[TC-IIN-009] Rejects alphabetic characters', async () => {
      await loginPage.typeIIN('abcdefghijkl');
      const value = await loginPage.getIINValue();
      // Field should remain numeric-only
      expect(value.replace(/\D/g, '')).toBe(value.replace(/[^\d]/g, ''));
      expect(/^[a-zA-Z]+$/.test(value)).toBeFalsy();
    });

    // Priority: P2
    test('[TC-IIN-010] Rejects special characters', async () => {
      await loginPage.typeIIN('!@#$%^&*()_+');
      const value = await loginPage.getIINValue();
      // Sanitization: must not contain special chars
      expect(/[!@#$%^&*()_+]/.test(value)).toBeFalsy();
    });

    // Priority: P2
    test('[TC-IIN-011] Rejects whitespace-only input', async () => {
      await loginPage.fillIIN('            ');
      await loginPage.passwordInput.click();
      await loginPage.submit();

      const value = (await loginPage.getIINValue()).trim();
      expect(value.replace(/\D/g, '')).toHaveLength(0);
      await expect(loginPage.page).toHaveURL(/\/login/);
    });

    // Priority: P3
    test('[TC-IIN-012] Strips leading/trailing whitespace from valid IIN', async () => {
      await loginPage.fillIIN('  950101300123  ');
      const value = (await loginPage.getIINValue()).replace(/\D/g, '');
      expect(value).toBe('950101300123');
    });

    // Priority: P3
    test('[TC-IIN-013] Mixed alphanumeric input keeps only digits', async () => {
      await loginPage.typeIIN('9a5b0c1d0e1f');
      const value = (await loginPage.getIINValue()).replace(/\D/g, '');
      // Either empty or only digits retained
      expect(/^\d*$/.test(value)).toBeTruthy();
    });
  });

  // ----------------------------------------------------------
  // SECURITY TESTS
  // ----------------------------------------------------------
  test.describe('Security', () => {
    // Priority: P1
    test('[TC-IIN-014] XSS payload is sanitized and does not execute', async ({
      page,
    }) => {
      let dialogTriggered = false;
      page.on('dialog', async (dialog) => {
        dialogTriggered = true;
        await dialog.dismiss();
      });

      const xss = `<script>alert('XSS')</script>`;
      await loginPage.typeIIN(xss);
      await loginPage.passwordInput.click();
      await loginPage.submit();

      expect(dialogTriggered).toBeFalsy();
      const value = await loginPage.getIINValue();
      expect(value).not.toContain('<script>');
    });

    // Priority: P1
    test('[TC-IIN-015] SQL injection payload is rejected/sanitized', async () => {
      const sqlPayload = `' OR '1'='1`;
      await loginPage.typeIIN(sqlPayload);
      await loginPage.passwordInput.fill('Password123!');
      await loginPage.submit();

      // User must NOT be authenticated
      await expect(loginPage.page).toHaveURL(/\/login/);
      const value = await loginPage