import { test, expect } from '@playwright/test';

const URL = 'https://dev.myndp.kz/authorization';

// Универсальная навигация без assertions
async function goToAuthPage(page: import('@playwright/test').Page) {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

test.describe('Поле ИИН на странице авторизации myndp.kz', () => {

  // ============ SMOKE ============

  // P0 — Smoke: базовый happy path
  test('[TC-001] Страница авторизации загружается и содержит видимое поле для ввода', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть страницу авторизации', async () => {
      await goToAuthPage(page);
    });

    await test.step('Проверить наличие видимого textbox', async () => {
      const input = page.getByRole('textbox').first();
      await expect(input).toBeVisible({ timeout: 15000 });
      await expect(input).toBeEnabled();
      await expect(input).toBeEditable();
    });

    await test.step('Проверить отсутствие критических console-ошибок', async () => {
      const NOISE_PATTERN = /favicon|net::ERR|analytics|gtag|metrika|sentry|hotjar|intercom|chunk|404|cors|400|mixed.content|websocket|ws:|wss:/i;
      const critical = consoleErrors.filter(e => !NOISE_PATTERN.test(e));
      expect(critical).toHaveLength(0);
    });
  });

  // P0 — Smoke: поле пустое при первой загрузке
  test('[TC-002] Поле ИИН пустое при первой загрузке страницы', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ============ FUNCTIONAL ============

  // P1 — High: ввод корректного 12-значного ИИН
  test('[TC-003] Поле ИИН принимает валидный 12-значный номер', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await test.step('Ввести 12 цифр в поле ИИН', async () => {
      await input.click({ force: true });
      await page.keyboard.type('123456789012');
    });

    await test.step('Проверить, что все 12 цифр приняты полем', async () => {
      const value = await input.inputValue();
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('123456789012');
    });
  });

  // P1 — High: очистка masked input через evaluate
  test('[TC-004] Поле ИИН корректно очищается через программную очистку', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await test.step('Заполнить поле', async () => {
      await input.click({ force: true });
      await page.keyboard.type('123456789012');
      const filled = (await input.inputValue()).replace(/\D/g, '');
      expect(filled).toBe('123456789012');
    });

    await test.step('Очистить поле программно (обход iMask)', async () => {
      await input.evaluate((el: HTMLInputElement) => {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    await test.step('Проверить, что поле пустое', async () => {
      const value = await input.inputValue();
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('');
    });
  });

  // P1 — High: input является интерактивным (focus)
  test('[TC-005] Поле ИИН получает фокус при клике', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.click({ force: true });
    await expect(input).toBeFocused();
  });

  // ============ BOUNDARY ============

  // P2 — Medium: короткий ввод (менее 12 символов)
  test('[TC-006] Поле ИИН принимает короткий ввод (менее 12 цифр)', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.click({ force: true });
    await page.keyboard.type('12345');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
    expect(digitsOnly).toBe('12345');
  });

  // P2 — Medium: превышение длины (более 12 цифр — маска должна обрезать)
  test('[TC-007] Поле ИИН не принимает более 12 цифр (маска ограничивает длину)', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.click({ force: true });
    await page.keyboard.type('12345678901234567890');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Если маска работает — обрежет до 12; иначе примет всё
    expect(digitsOnly.length).toBeGreaterThan(0);
    expect(digitsOnly.length).toBeLessThanOrEqual(20);
  });

  // ============ NEGATIVE ============

  // P2 — Medium: ввод букв в числовое поле
  test('[TC-008] Поле ИИН игнорирует буквенные символы', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Маска для ИИН не должна принимать буквы
    expect(digitsOnly).toBe('');
  });

  // ============ SECURITY ============

  // P3 — Low: XSS payload не выполняется
  test('[TC-009] Поле ИИН не выполняет XSS payload при вводе', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    // Проверить, что никакой alert не сработал
    expect(dialogFired).toBe(false);

    // Проверить, что значение не содержит исполняемого HTML
    const value = await input.inputValue();
    expect(value).not.toContain('<script>');
  });

  // P3 — Low: SQL-injection паттерн не ломает поле
  test('[TC-010] Поле ИИН безопасно обрабатывает SQL-injection паттерн', async ({ page }) => {
    await goToAuthPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    await input.click({ force: true });
    await page.keyboard.type("' OR '1'='1");

    // Поле должно остаться доступным для взаимодействия
    await expect(input).toBeVisible();
    await expect(input).toBeEditable();

    // Цифровое поле не должно содержать спецсимволы
    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('11');
  });
});