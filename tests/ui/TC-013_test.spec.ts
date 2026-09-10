import { test, expect, Page } from '@playwright/test';

const URL = 'https://company.nomad.kz/id/auth/login';

// Helper: только навигация, без assertions
async function gotoLoginPage(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

test.describe('Страница входа компании — поле ввода БИН', () => {

  // ============================================================
  // SMOKE TESTS (P0)
  // ============================================================

  test('[TC-001] Страница входа загружается и поле БИН отображается', async ({ page }) => {
    // P0 — Smoke: базовый happy path
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть страницу авторизации', async () => {
      await page.goto(URL);
      await page.waitForSelector('input:visible', { timeout: 30000 });
    });

    await test.step('Проверить наличие видимого поля ввода', async () => {
      const input = page.getByRole('textbox').first();
      await expect(input).toBeVisible({ timeout: 10000 });
      await expect(input).toBeEnabled();
      await expect(input).toBeEditable();
    });

    await test.step('Проверить отсутствие критических ошибок в консоли', async () => {
      const critical = consoleErrors.filter(e =>
        !e.toLowerCase().includes('favicon') &&
        !e.toLowerCase().includes('analytics') &&
        !e.toLowerCase().includes('gtag')
      );
      expect(critical).toHaveLength(0);
    });
  });

  test('[TC-002] Поле БИН пустое при первоначальной загрузке', async ({ page }) => {
    // P0 — Smoke: начальное состояние формы
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await expect(input).toHaveValue('');
  });

  test('[TC-003] Поле БИН доступно для фокуса и ввода', async ({ page }) => {
    // P0 — Smoke: возможность взаимодействия
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await expect(input).toBeFocused();
  });

  // ============================================================
  // FUNCTIONAL TESTS (P1)
  // ============================================================

  test('[TC-004] Ввод валидного 12-значного БИН отображается в поле', async ({ page }) => {
    // P1 — High: успешный ввод корректного БИН
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('123456789012');

    const value = (await input.inputValue()) || '';
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('123456789012');
  });

  test('[TC-005] Поле БИН не принимает буквенные символы', async ({ page }) => {
    // P1 — High: валидация формата ввода (только цифры)
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = (await input.inputValue()) || '';
    const hasLetters = /[a-zA-Zа-яА-Я]/.test(value);
    // В поле БИН не должно остаться буквенных символов после маски
    expect(hasLetters).toBe(false);
  });

  test('[TC-006] Поле БИН очищается после ручного удаления', async ({ page }) => {
    // P1 — High: переход из заполненного состояния в пустое
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('123456789012');

    let value = (await input.inputValue()) || '';
    expect(value.replace(/\D/g, '').length).toBeGreaterThan(0);

    await input.press('Control+A');
    await input.press('Delete');

    value = (await input.inputValue()) || '';
    expect(value.replace(/\D/g, '')).toBe('');
  });

  // ============================================================
  // BOUNDARY TESTS (P2)
  // ============================================================

  test('[TC-007] Поле БИН ограничивает ввод более 12 цифр', async ({ page }) => {
    // P2 — Medium: проверка верхней границы длины
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('1234567890123456789');

    const value = (await input.inputValue()) || '';
    const digits = value.replace(/\D/g, '');
    // БИН в Казахстане — 12 цифр, поле не должно принимать больше
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  test('[TC-008] Поле БИН принимает короткий (неполный) ввод без падения', async ({ page }) => {
    // P2 — Medium: проверка нижней границы — частичный ввод
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('123');

    const value = (await input.inputValue()) || '';
    expect(value.replace(/\D/g, '')).toBe('123');
    await expect(input).toBeVisible();
  });

  // ============================================================
  // NEGATIVE / SECURITY TESTS (P3)
  // ============================================================

  test('[TC-009] Поле БИН безопасно обрабатывает XSS payload без выполнения скрипта', async ({ page }) => {
    // P3 — Low / Security: защита от XSS
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type(`<script>alert('xss')</script>`);

    expect(dialogFired).toBe(false);

    const value = (await input.inputValue()) || '';
    // Маска БИН должна отфильтровать недопустимые символы
    expect(value).not.toContain('<script>');
  });

  test('[TC-010] Поле БИН не зависает при попытке вставки очень длинной строки', async ({ page }) => {
    // P3 — Low: производительность при больших данных
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    const largeInput = '1'.repeat(5000);

    const start = Date.now();
    await input.click({ force: true });
    await input.fill(largeInput);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();

    const value = (await input.inputValue()) || '';
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(12);
  });
});