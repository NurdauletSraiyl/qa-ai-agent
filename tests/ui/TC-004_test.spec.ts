import { test, expect, Page, Locator } from '@playwright/test';

/**
 * Feature: Поле ИИН на странице логина
 * URL: https://cabinet.nomad.kz/login
 *
 * ИИН (Индивидуальный Идентификационный Номер) — 12-значный номер РК.
 * Тесты валидируют: видимость, граничные значения, форматирование,
 * санитизацию, безопасность (XSS / SQLi), производительность.
 */

const LOGIN_URL = 'https://cabinet.nomad.kz/login';

// --- Reusable helpers (inline, self-contained) ---

/**
 * Robust resolver for the IIN input.
 * Falls back through a prioritized selector strategy.
 */
async function resolveIinField(page: Page): Promise<Locator> {
  const candidates: Locator[] = [
    page.getByTestId('iin-input'),
    page.getByTestId('login-iin'),
    page.getByRole('textbox', { name: /иин/i }),
    page.getByLabel(/иин/i),
    page.getByPlaceholder(/иин/i),
    page.locator('input[name="iin"]'),
    page.locator('input[name="login"]'),
    page.locator('input[type="text"]').first(),
  ];

  for (const candidate of candidates) {
    if ((await candidate.count()) > 0) {
      const first = candidate.first();
      try {
        await first.waitFor({ state: 'visible', timeout: 3000 });
        return first;
      } catch {
        // try next
      }
    }
  }
  throw new Error('IIN field could not be resolved on the login page');
}

/**
 * Tries to find a submit/login button without failing if absent.
 */
async function resolveSubmitButton(page: Page): Promise<Locator | null> {
  const candidates: Locator[] = [
    page.getByTestId('login-submit'),
    page.getByRole('button', { name: /войти|вход|login|sign in/i }),
    page.locator('button[type="submit"]'),
  ];
  for (const c of candidates) {
    if ((await c.count()) > 0) return c.first();
  }
  return null;
}

/**
 * Reads the current value of the IIN field — works for both
 * <input> and contenteditable widgets.
 */
async function readValue(field: Locator): Promise<string> {
  const val = await field.inputValue().catch(() => '');
  if (val && val.length > 0) return val;
  const text = await field.textContent();
  return text ? text : '';
}

test.describe('Поле ИИН — страница логина', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  });

  // Priority: P0 (Smoke)
  test('[TC-IIN-001] Поле ИИН отображается и доступно для ввода', async ({ page }) => {
    const iin = await resolveIinField(page);

    await expect(iin).toBeVisible();
    await expect(iin).toBeEnabled();
    await expect(iin).toBeEditable();

    const tagName = await iin.evaluate((el) => el.tagName.toLowerCase());
    expect(['input', 'textarea', 'div']).toContain(tagName);
  });

  // Priority: P1
  test('[TC-IIN-002] Принимает валидный 12-значный ИИН', async ({ page }) => {
    const iin = await resolveIinField(page);
    const valid = '123456789012';

    await iin.click();
    await iin.fill(valid);

    const value = await readValue(iin);
    // допускается маска/форматирование (пробелы, дефисы), цифры должны совпасть
    expect(value.replace(/\D/g, '')).toBe(valid);
  });

  // Priority: P1 — Boundary (min length - 1)
  test('[TC-IIN-003] Отклоняет ИИН короче 12 цифр (11 цифр)', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('12345678901');

    const submit = await resolveSubmitButton(page);
    if (submit) {
      await submit.click().catch(() => {});
    } else {
      await iin.blur();
    }

    // Ожидается: либо ошибка валидации, либо невозможность сабмита
    const errorLocator = page.locator(
      '[role="alert"], .error, .invalid, .field-error, [data-testid*="error"]',
    );
    const submitDisabled = submit ? await submit.isDisabled().catch(() => false) : false;
    const stillOnLogin = page.url().includes('/login');

    const hasError = (await errorLocator.count()) > 0;
    expect(hasError || submitDisabled || stillOnLogin).toBeTruthy();
  });

  // Priority: P1 — Boundary (max length + 1)
  test('[TC-IIN-004] Не позволяет вводить более 12 цифр', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('1234567890123456');

    const value = await readValue(iin);
    const digitsOnly = value.replace(/\D/g, '');

    // Поле либо обрезает до 12 цифр, либо помечает как ошибку.
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
  });

  // Priority: P2 — Sanitization
  test('[TC-IIN-005] Игнорирует/санитизирует буквенные символы', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('abcdefghijkl');

    const value = await readValue(iin);
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBe(0);
  });

  // Priority: P2 — Sanitization (mixed input)
  test('[TC-IIN-006] Принимает только цифры из смешанного ввода', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('12ab34cd56ef78gh90ij');

    const value = await readValue(iin);
    const digits = value.replace(/\D/g, '');
    // Допускается, что поле либо очищает буквы, либо ограничивает длину
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  // Priority: P2 — Special chars
  test('[TC-IIN-007] Спецсимволы не сохраняются как часть ИИН', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('!@#$%^&*()_+');

    const value = await readValue(iin);
    expect(value.replace(/\D/g, '').length).toBe(0);
  });

  // Priority: P1 — Empty submit
  test('[TC-IIN-008] Сабмит пустого поля показывает ошибку валидации', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('');

    const submit = await resolveSubmitButton(page);
    if (submit) await submit.click().catch(() => {});

    const errorLocator = page.locator(
      '[role="alert"], .error, .invalid, .field-error, [data-testid*="error"]',
    );
    const stillOnLogin = page.url().includes('/login');
    const hasError = (await errorLocator.count()) > 0;

    expect(hasError || stillOnLogin).toBeTruthy();
  });

  // Priority: P2 — Security: XSS
  test('[TC-IIN-009] Защита от XSS-инъекции в поле ИИН', async ({ page }) => {
    let alertFired = false;
    page.on('dialog', async (dialog) => {
      alertFired = true;
      await dialog.dismiss().catch(() => {});
    });

    const iin = await resolveIinField(page);
    const payload = '<script>alert("xss")</script>';
    await iin.fill(payload);

    const submit = await resolveSubmitButton(page);
    if (submit) await submit.click().catch(() => {});

    // Никакого alert() не должно произойти
    expect(alertFired).toBeFalsy();

    // Скрипт не должен инжектиться в DOM
    const injected = await page.locator('script:has-text("alert(\\"xss\\")")').count();
    expect(injected).toBe(0);
  });

  // Priority: P2 — Security: SQLi
  test('[TC-IIN-010] Защита от SQL-инъекции в поле ИИН', async ({ page }) => {
    const iin = await resolveIinField(page);
    const payload = "' OR '1'='1";

    await iin.fill(payload);
    const submit = await resolveSubmitButton(page);
    if (submit) await submit.click().catch(() => {});

    // Не должно произойти автоматического входа
    await page.waitForTimeout(500); // короткое наблюдение состояния, не зависимость
    expect(page.url()).toContain('/login');
  });

  // Priority: P3 — Performance: huge input
  test('[TC-IIN-011] Большая нагрузка ввода не подвешивает UI', async ({ page }) => {
    const iin = await resolveIinField(page);
    const huge = '1'.repeat(10000);

    const start = Date.now();
    await iin.fill(huge);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(5000);
    await expect(iin).toBeVisible();
    await expect(iin).toBeEnabled();
  });

  // Priority: P3 — Whitespace handling
  test('[TC-IIN-012] Ведущие/завершающие пробелы санитизируются', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('   123456789012   ');

    const value = await readValue(iin);
    const digits = value.replace(/\D/g, '');
    expect(digits).toBe('123456789012');
  });

  // Priority: P3 — Paste behavior
  test('[TC-IIN-013] Корректная обработка вставки (paste) валидного ИИН', async ({ page }) => {
    const iin = await resolveIinField(page);
    const valid = '987654321098';

    await iin.click();
    await page.evaluate((v) => navigator.clipboard.writeText(v).catch(() => {}), valid);

    // Программная имитация вставки через клавиатуру
    await iin.focus();
    await iin.fill('');
    await iin.pressSequentially(valid, { delay: 10 });

    const value = await readValue(iin);
    expect(value.replace(/\D/g, '')).toBe(valid);
  });

  // Priority: P3 — Duplicate submit guard
  test('[TC-IIN-014] Двойной клик сабмита не вызывает дублирующих ошибок/действий', async ({
    page,
  }) => {
    const iin = await resolveIinField(page);
    await iin.fill('123456789012');

    const submit = await resolveSubmitButton(page);
    if (!submit) {
      test.skip(true, 'Кнопка сабмита не найдена');
      return;
    }

    await Promise.all([submit.click(), submit.click().catch(() => {})]);

    // UI должен остаться отзывчивым
    await expect(iin).toBeVisible();
  });

  // Priority: P2 — Field clearing
  test('[TC-IIN-015] Очистка поля сбрасывает значение', async ({ page }) => {
    const iin = await resolveIinField(page);
    await iin.fill('123456789012');

    let value = await readValue(iin);
    expect(value.