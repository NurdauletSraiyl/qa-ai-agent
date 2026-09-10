import { test, expect, Locator, Page } from '@playwright/test';

const URL = 'https://dev.myndp.kz/authorization';

// ============================================================
// Helper: навигация на страницу авторизации
// ============================================================
async function openAuthPage(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

// ============================================================
// Helper: получить локатор поля ИИН (без assertions внутри)
// ============================================================
function getIinInput(page: Page): Locator {
  return page.getByRole('textbox').first();
}

// ============================================================
// Helper: очистка masked input через evaluate (единственный надёжный способ)
// ============================================================
async function clearMaskedInput(input: Locator): Promise<void> {
  await input.evaluate((el: HTMLInputElement) => {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

test.describe('Поле ИИН на странице авторизации myndp.kz', () => {

  // ============================================================
  // SMOKE TESTS
  // ============================================================

  // P0 — Smoke: базовый happy path
  test('[TC-IIN-001] Страница авторизации загружается и поле ИИН отображается', async ({ page }) => {
    await test.step('Открыть страницу авторизации', async () => {
      await openAuthPage(page);
    });

    await test.step('Проверить, что поле ввода видимо и доступно', async () => {
      const iinInput = getIinInput(page);
      await expect(iinInput).toBeVisible({ timeout: 10000 });
      await expect(iinInput).toBeEnabled();
      await expect(iinInput).toBeEditable();
    });
  });

  // P0 — Smoke: поле ИИН пустое при первой загрузке
  test('[TC-IIN-002] Поле ИИН пустое при первой загрузке страницы', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ============================================================
  // FUNCTIONAL TESTS
  // ============================================================

  // P1 — High: ввод валидного ИИН из 12 цифр
  test('[TC-IIN-003] Ввод валидного ИИН из 12 цифр принимается полем', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await test.step('Ввести 12 цифр в поле ИИН', async () => {
      await iinInput.click({ force: true });
      await page.keyboard.type('123456789012');
    });

    await test.step('Проверить, что в поле содержится 12 цифр', async () => {
      const value = await iinInput.inputValue();
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('123456789012');
    });
  });

  // P1 — High: поле принимает только цифры
  test('[TC-IIN-004] Поле ИИН не принимает буквы латиницы и кириллицы', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('abcdefghijkl');
    await page.keyboard.type('абвгдежзийкл');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Ожидается, что маска не пропустит буквы — цифр быть не должно
    expect(digitsOnly).toBe('');
  });

  // P1 — High: очистка masked input работает корректно
  test('[TC-IIN-005] Очистка поля ИИН через evaluate сбрасывает значение', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await test.step('Ввести валидный ИИН', async () => {
      await iinInput.click({ force: true });
      await page.keyboard.type('123456789012');
      const value = await iinInput.inputValue();
      expect(value.replace(/\D/g, '')).toBe('123456789012');
    });

    await test.step('Очистить поле через evaluate', async () => {
      await clearMaskedInput(iinInput);
    });

    await test.step('Проверить, что поле пустое', async () => {
      const value = await iinInput.inputValue();
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('');
    });
  });

  // ============================================================
  // BOUNDARY TESTS
  // ============================================================

  // P2 — Medium: попытка ввести больше 12 цифр
  test('[TC-IIN-006] Поле ИИН обрезает ввод более 12 цифр (граница maxLength)', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('123456789012345678'); // 18 цифр

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Маска ИИН строго 12 символов — больше быть не может
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
    expect(digitsOnly.startsWith('123456789012')).toBe(true);
  });

  // P2 — Medium: неполный ИИН (меньше 12 цифр)
  test('[TC-IIN-007] Поле ИИН корректно отображает неполный ввод (менее 12 цифр)', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('12345');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('12345');
    expect(digitsOnly.length).toBeLessThan(12);
  });

  // ============================================================
  // NEGATIVE / SECURITY TESTS
  // ============================================================

  // P3 — Low: спецсимволы игнорируются маской
  test('[TC-IIN-008] Поле ИИН игнорирует спецсимволы !@#$%^&*()', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type('!@#$%^&*()');

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // P3 — Low: защита от XSS
  test('[TC-IIN-009] XSS payload не выполняется в поле ИИН', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => {
      dialogFired = true;
      await d.dismiss();
    });

    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    // Диалог не должен появиться
    expect(dialogFired).toBe(false);

    // В поле не должно быть html-содержимого
    const value = await iinInput.inputValue();
    expect(value).not.toContain('<script>');
    expect(value).not.toContain('alert');
  });

  // P3 — Low: SQL injection не ломает интерфейс
  test('[TC-IIN-010] SQL injection в поле ИИН не нарушает работу страницы', async ({ page }) => {
    await openAuthPage(page);

    const iinInput = getIinInput(page);
    await expect(iinInput).toBeVisible({ timeout: 10000 });

    await iinInput.click({ force: true });
    await page.keyboard.type("' OR '1'='1");

    // Поле остаётся работоспособным
    await expect(iinInput).toBeVisible();
    await expect(iinInput).toBeEnabled();

    const value = await iinInput.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Маска отфильтровала спецсимволы, могла оставить только "11"
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
    expect(value).not.toContain('OR');
  });
});