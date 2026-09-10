import { test, expect } from '@playwright/test';

const URL = 'https://dev.myndp.kz/authorization';

// Helper: базовая навигация (без assertions)
async function openPage(page: import('@playwright/test').Page) {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

test.describe('Поле ИИН — форма авторизации myndp.kz', () => {

  // ============ SMOKE ============

  // P0 — Smoke: базовый happy path
  test('[TC-IIN-001] Страница авторизации загружается и содержит видимое поле ввода', async ({ page }) => {
    await test.step('Открыть страницу авторизации', async () => {
      await page.goto(URL);
      await page.waitForSelector('input:visible', { timeout: 30000 });
    });

    await test.step('Убедиться, что видимое поле ввода присутствует', async () => {
      const input = page.getByRole('textbox').first();
      await expect(input).toBeVisible();
      await expect(input).toBeEditable();
    });
  });

  // P0 — Smoke: поле пустое при загрузке
  test('[TC-IIN-002] Поле ИИН пустое при первом открытии страницы', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();
    await expect(input).toBeVisible();
    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ============ FUNCTIONAL ============

  // P1 — High: ввод корректного 12-значного ИИН
  test('[TC-IIN-003] Ввод 12 цифр в поле ИИН — значение принимается', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();
    await input.click({ force: true });
    await page.keyboard.type('123456789012');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('123456789012');
    expect(digitsOnly.length).toBe(12);
  });

  // P1 — High: буквы не принимаются либо игнорируются masked input
  test('[TC-IIN-004] Буквенный ввод в поле ИИН — символы отфильтровываются', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();
    await input.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // При корректной маске буквы не должны попасть в поле
    expect(digitsOnly.length).toBe(0);
  });

  // P1 — High: очистка поля через evaluate
  test('[TC-IIN-005] Очистка поля ИИН после ввода', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();

    await test.step('Ввести 12 цифр', async () => {
      await input.click({ force: true });
      await page.keyboard.type('123456789012');
      const v = await input.inputValue();
      expect(v.replace(/\D/g, '')).toBe('123456789012');
    });

    await test.step('Очистить поле через evaluate', async () => {
      await input.evaluate((el: HTMLInputElement) => {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    await test.step('Убедиться, что поле пустое', async () => {
      const cleared = await input.inputValue();
      expect(cleared.replace(/\D/g, '')).toBe('');
    });
  });

  // ============ BOUNDARY ============

  // P2 — Medium: ввод менее 12 цифр (граничное значение)
  test('[TC-IIN-006] Ввод 11 цифр — значение короче требуемой длины', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();
    await input.click({ force: true });
    await page.keyboard.type('12345678901');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly.length).toBeLessThan(12);
    expect(digitsOnly).toBe('12345678901');
  });

  // P2 — Medium: попытка ввода более 12 цифр — маска обрезает
  test('[TC-IIN-007] Ввод более 12 цифр — маска обрезает лишние символы', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();
    await input.click({ force: true });
    await page.keyboard.type('12345678901234567890');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    // Маска ИИН должна ограничить длину до 12 символов
    expect(digitsOnly.length).toBeLessThanOrEqual(12);
  });

  // ============ NEGATIVE ============

  // P2 — Medium: спецсимволы игнорируются
  test('[TC-IIN-008] Ввод спецсимволов в поле ИИН — символы отфильтровываются', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();
    await input.click({ force: true });
    await page.keyboard.type('!@#$%^&*()_+');

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly.length).toBe(0);
  });

  // ============ SECURITY ============

  // P3 — Low: XSS payload не вызывает диалог и не исполняется
  test('[TC-IIN-009] Попытка XSS через поле ИИН не приводит к выполнению скрипта', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => {
      dialogFired = true;
      await d.dismiss();
    });

    await openPage(page);

    const input = page.getByRole('textbox').first();
    await input.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    // Ждём разумное окно на возможный dialog через ожидание видимости самого input
    await expect(input).toBeVisible();

    expect(dialogFired).toBe(false);

    const value = await input.inputValue();
    // Скриптовый тег не должен сохраниться как есть в masked input
    expect(value).not.toContain('<script>');
  });

  // P3 — Low: SQL injection payload — только цифры сохраняются, страница не падает
  test('[TC-IIN-010] SQL-инъекция в поле ИИН — вредоносная строка не сохраняется', async ({ page }) => {
    await openPage(page);

    const input = page.getByRole('textbox').first();
    await input.click({ force: true });
    await page.keyboard.type("' OR '1'='1");

    const value = await input.inputValue();
    expect(value).not.toContain("OR");
    expect(value).not.toContain("'");

    // Страница остаётся работоспособной
    await expect(input).toBeVisible();
    await expect(input).toBeEditable();
  });
});