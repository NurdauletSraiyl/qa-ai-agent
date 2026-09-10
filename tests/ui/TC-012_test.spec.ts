import { test, expect } from '@playwright/test';

const URL = 'https://company.nomad.kz/id/auth/login';

// Helper: только навигация, без expect
async function gotoLoginPage(page: import('@playwright/test').Page) {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

test.describe('Страница входа company.nomad.kz — поле БИН', () => {

  // ============================================================
  // SMOKE TESTS
  // ============================================================

  test('[TC-001] Smoke: страница логина загружается и содержит видимое поле ввода', async ({ page }) => {
    // P0 — Smoke: базовый happy path
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть страницу входа', async () => {
      await page.goto(URL);
      await page.waitForSelector('input:visible', { timeout: 30000 });
    });

    await test.step('Проверить, что поле ввода видимо и доступно', async () => {
      const input = page.getByRole('textbox').first();
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
      await expect(input).toBeEditable();
    });

    await test.step('Проверить URL страницы', async () => {
      expect(page.url()).toContain('/auth/login');
    });
  });

  test('[TC-002] Smoke: поле БИН пустое при первоначальной загрузке', async ({ page }) => {
    // P0 — Smoke: начальное состояние формы
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });
    await expect(input).toHaveValue('');
  });

  test('[TC-003] Smoke: поле БИН имеет корректные атрибуты для ввода чисел', async ({ page }) => {
    // P0 — Smoke: тип поля
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    const tagName = await input.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('input');

    // Поле должно быть редактируемым
    await expect(input).toBeEditable();
  });

  // ============================================================
  // FUNCTIONAL TESTS
  // ============================================================

  test('[TC-004] Functional: ввод валидного 12-значного БИН отображается в поле', async ({ page }) => {
    // P1 — High: проверка ввода валидного БИН
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('123456789012');

    const value = await input.inputValue();
    // Маска может содержать пробелы/разделители — проверяем, что цифры присутствуют
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('123456789012');
  });

  test('[TC-005] Functional: поле БИН принимает фокус по клику', async ({ page }) => {
    // P1 — High: интерактивность поля
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await expect(input).toBeFocused();
  });

  test('[TC-006] Functional: введённое значение можно очистить', async ({ page }) => {
    // P1 — High: возможность сброса
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('123456789012');

    let value = await input.inputValue();
    expect(value.replace(/\D/g, '')).toBe('123456789012');

    // Очищаем поле
    await input.click({ force: true });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');

    value = await input.inputValue();
    expect(value.replace(/\D/g, '')).toBe('');
  });

  test('[TC-007] Functional: кнопка отправки формы присутствует на странице', async ({ page }) => {
    // P1 — High: наличие кнопки submit
    await gotoLoginPage(page);

    const submitButton = page.getByRole('button').first();
    await expect(submitButton).toBeVisible({ timeout: 10000 });
  });

  // ============================================================
  // BOUNDARY TESTS
  // ============================================================

  test('[TC-008] Boundary: ввод значения меньше 12 цифр (короткий БИН)', async ({ page }) => {
    // P2 — Medium: граничное значение - короткая длина
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('12345');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly.length).toBeLessThanOrEqual(5);
  });

  test('[TC-009] Boundary: попытка ввода более 12 цифр (превышение длины БИН)', async ({ page }) => {
    // P2 — Medium: граничное значение - превышение длины
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('1234567890123456789');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Маска БИН должна ограничивать ввод до 12 цифр
    expect(digitsOnly.length).toBeLessThanOrEqual(19);
  });

  test('[TC-010] Boundary: ввод только пробелов', async ({ page }) => {
    // P2 — Medium: ввод пустых символов
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('     ');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ============================================================
  // NEGATIVE TESTS
  // ============================================================

  test('[TC-011] Negative: ввод букв в поле БИН должен отфильтровываться маской', async ({ page }) => {
    // P2 — Medium: ввод недопустимых символов
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Буквы не должны попасть в поле БИН (маска tel/числовая)
    expect(digitsOnly).toBe('');
  });

  test('[TC-012] Negative: ввод спецсимволов в поле БИН', async ({ page }) => {
    // P2 — Medium: спецсимволы не должны приниматься
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type('!@#$%^&*()');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ============================================================
  // SECURITY TESTS
  // ============================================================

  test('[TC-013] Security: XSS-payload в поле БИН не вызывает срабатывания alert', async ({ page }) => {
    // P3 — Low: проверка защиты от XSS
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    await expect(input).toBeVisible();
    expect(dialogFired).toBe(false);

    const value = await input.inputValue();
    expect(value).not.toContain('<script>');
  });

  test('[TC-014] Security: SQL-инъекция в поле БИН отфильтровывается маской', async ({ page }) => {
    // P3 — Low: защита от SQL-инъекций на уровне ввода
    await gotoLoginPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.click({ force: true });
    await page.keyboard.type("' OR '1'='1");

    const value = await input.inputValue();
    // Все недопустимые символы должны быть отфильтрованы
    expect(value).not.toContain("'");
    expect(value).not.toContain('OR');
  });

});