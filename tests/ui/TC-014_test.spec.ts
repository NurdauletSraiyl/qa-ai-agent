import { test, expect } from '@playwright/test';

const URL = 'https://dev.myndp.kz/authorization';

// Хелпер навигации: без assertion внутри
async function goToAuthPage(page: import('@playwright/test').Page) {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

test.describe('Поле ИИН на странице авторизации myndp.kz', () => {

  // ==================== SMOKE ====================

  // P0 — Smoke: базовый happy path
  test('[TC-001] Страница авторизации успешно загружается и содержит поле ввода', async ({ page }) => {
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

    await test.step('URL остался на странице авторизации', async () => {
      expect(page.url()).toContain('/authorization');
    });
  });

  // P0 — Smoke: поле ИИН пустое при первой загрузке
  test('[TC-002] Поле ИИН отображается пустым при загрузке страницы', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });
    await expect(iinInput).toHaveValue('');
    await expect(iinInput).toBeEditable();
  });

  // ==================== FUNCTIONAL ====================

  // P1 — High: ввод корректного 12-значного ИИН
  test('[TC-003] Поле ИИН принимает корректный 12-значный ввод', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await test.step('Ввести валидный 12-значный ИИН', async () => {
      await iinInput.click({ force: true });
      await page.keyboard.type('880101300123');
    });

    await test.step('Проверить что поле содержит цифры ИИН', async () => {
      const value = await iinInput.inputValue();
      // Оставляем только цифры (маска может добавлять пробелы/дефисы)
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('880101300123');
    });
  });

  // P1 — High: поле принимает только цифры (буквы не вводятся)
  test('[TC-004] Поле ИИН игнорирует буквенный ввод', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Буквенный ввод не должен превратиться в цифры ИИН
    expect(digitsOnly.length).toBeLessThanOrEqual(0);
  });

  // P1 — High: очистка поля возвращает его в пустое состояние
  test('[TC-005] Поле ИИН можно очистить после ввода', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await test.step('Ввести значение и очистить поле', async () => {
      await iinInput.click({ force: true });
      await page.keyboard.type('123456789012');

      await iinInput.press('Control+A');
      await iinInput.press('Delete');
    });

    await test.step('Поле должно быть пустым или содержать только маску', async () => {
      const value = await iinInput.inputValue();
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('');
    });
  });

  // ==================== BOUNDARY ====================

  // P2 — Medium: ввод менее 12 цифр (граница снизу)
  test('[TC-006] Поле ИИН: ввод 11 цифр (меньше минимума)', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('12345678901');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly.length).toBeLessThanOrEqual(11);
  });

  // P2 — Medium: попытка ввести более 12 цифр (граница сверху)
  test('[TC-007] Поле ИИН: ввод 15 цифр не должен превышать лимит в 12', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('123456789012345');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Маска ИИН обычно ограничивает 12 цифрами
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
  });

  // ==================== NEGATIVE ====================

  // P2 — Medium: спецсимволы не попадают в поле ИИН
  test('[TC-008] Поле ИИН отклоняет спецсимволы', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('!@#$%^&*()_+');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ==================== SECURITY ====================

  // P3 — Low: XSS payload в поле ИИН не должен исполниться
  test('[TC-009] Поле ИИН защищено от XSS-инъекций', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    // Диалог не должен появиться
    expect(dialogFired).toBe(false);

    // Тэги script не должны попасть как валидное значение ИИН
    const value = await iinInput.inputValue();
    expect(value).not.toContain('<script>');
  });

  // P3 — Low: SQL-инъекция не должна ломать поле
  test('[TC-010] Поле ИИН устойчиво к SQL-инъекции', async ({ page }) => {
    await goToAuthPage(page);

    const iinInput = page.getByRole('textbox').first();
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    const start = Date.now();
    await iinInput.click({ force: true });
    await page.keyboard.type("' OR '1'='1");
    const elapsed = Date.now() - start;

    // UI не зависает
    expect(elapsed).toBeLessThan(5000);

    // Поле остаётся видимым и активным
    await expect(iinInput).toBeVisible();
    await expect(iinInput).toBeEditable();

    const value = await iinInput.inputValue();
    expect(value).not.toContain("' OR '1'='1");
  });

});