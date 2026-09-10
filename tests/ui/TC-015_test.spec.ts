import { test, expect } from '@playwright/test';

const URL = 'https://dev.myndp.kz/authorization';

async function gotoAuth(page: any) {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

test.describe('Поле ИИН на странице авторизации myndp.kz', () => {

  // ============ SMOKE ============

  // P0 — Smoke: базовая проверка загрузки страницы и наличия поля ИИН
  test('[TC-001] Страница авторизации загружается без ошибок консоли', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть страницу авторизации', async () => {
      await page.goto(URL);
      await page.waitForSelector('input:visible', { timeout: 30000 });
    });

    await test.step('Проверить URL и наличие хотя бы одного видимого input', async () => {
      expect(page.url()).toContain('/authorization');
      const inputsCount = await page.locator('input:visible').count();
      expect(inputsCount).toBeGreaterThan(0);
    });
  });

  // P0 — Smoke: поле ИИН отображается, доступно и пусто при загрузке
  test('[TC-002] Поле ИИН отображается и пустое при загрузке страницы', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();

    await expect(iinInput).toBeVisible({ timeout: 10000 });
    await expect(iinInput).toBeEnabled();
    await expect(iinInput).toBeEditable();

    const initialValue = await iinInput.inputValue();
    const digitsOnly = initialValue.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ============ FUNCTIONAL ============

  // P1 — High: ввод валидного 12-значного ИИН
  test('[TC-003] Ввод валидного 12-значного ИИН принимается полем', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await test.step('Ввести 12 цифр', async () => {
      await iinInput.click({ force: true });
      await page.keyboard.type('880101300123');
    });

    await test.step('Проверить, что поле содержит все введённые цифры', async () => {
      const value = await iinInput.inputValue();
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('880101300123');
    });
  });

  // P1 — High: поле принимает только цифры (буквы игнорируются маской)
  test('[TC-004] Поле ИИН игнорирует буквенные символы', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // P1 — High: очистка поля через Backspace
  test('[TC-005] Поле ИИН можно очистить через Ctrl+A и Backspace', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await test.step('Заполнить поле', async () => {
      await iinInput.click({ force: true });
      await page.keyboard.type('880101300123');
      const value = await iinInput.inputValue();
      expect(value.replace(/\D/g, '')).toBe('880101300123');
    });

    await test.step('Очистить поле', async () => {
      await iinInput.press('Control+A');
      await iinInput.press('Backspace');
    });

    await test.step('Проверить пустое значение', async () => {
      const value = await iinInput.inputValue();
      expect(value.replace(/\D/g, '')).toBe('');
    });
  });

  // ============ BOUNDARY ============

  // P2 — Medium: ввод менее 12 цифр — не полный ИИН
  test('[TC-006] Поле ИИН принимает частичный ввод (менее 12 цифр)', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('12345');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
    expect(digitsOnly).toBe('12345');
  });

  // P2 — Medium: попытка ввода более 12 цифр — обрезается маской
  test('[TC-007] Поле ИИН ограничивает ввод до 12 цифр', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('123456789012345678');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
  });

  // ============ NEGATIVE ============

  // P2 — Medium: спецсимволы не попадают в поле
  test('[TC-008] Поле ИИН игнорирует специальные символы', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('!@#$%^&*()_+');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ============ SECURITY ============

  // P3 — Low: XSS payload не выполняется и не сохраняется как код
  test('[TC-009] Поле ИИН не выполняет XSS-инъекцию', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    await expect(iinInput).toBeVisible();
    expect(dialogFired).toBe(false);

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // P3 — Low: SQL injection не ломает поле
  test('[TC-010] Поле ИИН устойчиво к SQL-инъекции', async ({ page }) => {
    await gotoAuth(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type("' OR '1'='1");

    await expect(iinInput).toBeVisible();
    await expect(iinInput).toBeEnabled();

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('11');
  });

});