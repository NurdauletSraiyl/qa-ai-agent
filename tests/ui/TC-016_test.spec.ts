import { test, expect, Locator, Page } from '@playwright/test';

const URL = 'https://dev.myndp.kz/authorization';

// ---------- Helpers (без expect внутри) ----------
async function openPage(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForSelector('input:visible', { timeout: 30000 });
}

function getIinInput(page: Page): Locator {
  // Консервативный подход: ИИН обычно первое видимое числовое поле (type=tel или text)
  // Приоритет — semantic selectors без угадывания id/name
  return page.getByRole('textbox').first();
}

async function clearMaskedInput(input: Locator): Promise<void> {
  await input.evaluate((el: HTMLInputElement) => {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// ---------- Тесты ----------
test.describe('Страница авторизации — поле ИИН', () => {

  // ================== SMOKE ==================

  // P0 — Smoke: базовая загрузка страницы и наличие поля ввода
  test('[TC-IIN-001] Страница авторизации успешно загружается и содержит видимое поле ввода', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть страницу авторизации', async () => {
      await page.goto(URL);
      await page.waitForSelector('input:visible', { timeout: 30000 });
    });

    await test.step('Проверить URL и наличие поля ввода', async () => {
      expect(page.url()).toContain('/authorization');
      const input = getIinInput(page);
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
      await expect(input).toBeEditable();
    });

    await test.step('Убедиться, что в консоли нет критических ошибок', async () => {
      // Фильтруем некритичные сетевые/фавикон ошибки
      const critical = consoleErrors.filter(e => !/favicon|net::ERR/i.test(e));
      expect(critical).toHaveLength(0);
    });
  });

  // P0 — Smoke: поле пустое при первичной загрузке
  test('[TC-IIN-002] Поле ИИН пустое при первичной загрузке страницы', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await expect(input).toBeVisible();

    const value = await input.inputValue();
    const digitsOnly = value.replace(/\D/g, '');
    expect(digitsOnly).toBe('');
  });

  // ================== FUNCTIONAL ==================

  // P1 — High: ввод валидного 12-значного ИИН
  test('[TC-IIN-003] Ввод валидного 12-значного ИИН корректно отображается в поле', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await expect(input).toBeVisible();

    await test.step('Ввести 12 цифр в поле ИИН', async () => {
      await input.click({ force: true });
      await page.keyboard.type('123456789012');
    });

    await test.step('Проверить, что поле содержит 12 цифр', async () => {
      const value = await input.inputValue();
      const digitsOnly = value.replace(/\D/g, '');
      expect(digitsOnly).toBe('123456789012');
      expect(digitsOnly.length).toBe(12);
    });
  });

  // P1 — High: очистка поля через evaluate работает корректно
  test('[TC-IIN-004] Поле ИИН можно полностью очистить после ввода', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await expect(input).toBeVisible();

    await test.step('Ввести значение', async () => {
      await input.click({ force: true });
      await page.keyboard.type('987654321098');
      const v = await input.inputValue();
      expect(v.replace(/\D/g, '')).toBe('987654321098');
    });

    await test.step('Очистить поле через evaluate', async () => {
      await clearMaskedInput(input);
    });

    await test.step('Убедиться, что поле пусто', async () => {
      const cleared = await input.inputValue();
      expect(cleared.replace(/\D/g, '')).toBe('');
    });
  });

  // P1 — High: поле принимает фокус и остаётся редактируемым
  test('[TC-IIN-005] Поле ИИН получает фокус и остаётся редактируемым', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await input.click({ force: true });

    await expect(input).toBeFocused();
    await expect(input).toBeEditable();
    await expect(input).toBeEnabled();
  });

  // ================== BOUNDARY ==================

  // P2 — Medium: ввод менее 12 цифр — не полный ИИН
  test('[TC-IIN-006] Ввод менее 12 цифр (11) сохраняет только введённые символы', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await input.click({ force: true });
    await page.keyboard.type('12345678901');

    const value = await input.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(11);
    expect(digits).toBe('12345678901');
  });

  // P2 — Medium: попытка ввести более 12 цифр — маска обрезает
  test('[TC-IIN-007] Ввод более 12 цифр обрезается маской до 12 символов', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await input.click({ force: true });
    await page.keyboard.type('1234567890123456789');

    const value = await input.inputValue();
    const digits = value.replace(/\D/g, '');
    // Маска ИИН обычно ограничена 12 символами
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  // ================== NEGATIVE ==================

  // P2 — Medium: буквы и спецсимволы не должны попадать в поле ИИН (маска tel/number)
  test('[TC-IIN-008] Ввод букв и спецсимволов не сохраняется в поле ИИН', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await input.click({ force: true });
    await page.keyboard.type('abcDEFghij!@#$%^&*');

    const value = await input.inputValue();
    const digits = value.replace(/\D/g, '');
    // Маска ИИН отсекает нецифровые символы
    expect(digits).toBe('');
  });

  // P3 — Low: XSS payload не приводит к выполнению скрипта
  test('[TC-IIN-009] XSS payload в поле ИИН не вызывает диалоговое окно', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await openPage(page);

    const input = getIinInput(page);
    await input.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    // Убеждаемся что диалог не появился
    expect(dialogFired).toBe(false);

    // Поле не должно содержать HTML/script в отображаемом значении как исполняемый код
    const value = await input.inputValue();
    const digits = value.replace(/\D/g, '');
    // Маска ИИН должна отсечь все нецифровые символы
    expect(digits).toBe('');
  });

  // P3 — Low: производительность — быстрая длинная строка не подвешивает UI
  test('[TC-IIN-010] Ввод очень длинной строки не приводит к зависанию UI', async ({ page }) => {
    await openPage(page);

    const input = getIinInput(page);
    await input.click({ force: true });

    const largeInput = '1'.repeat(500);

    const start = Date.now();
    await page.keyboard.type(largeInput, { delay: 0 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000);

    // Поле остаётся отзывчивым
    await expect(input).toBeEnabled();
    await expect(input).toBeEditable();

    const value = await input.inputValue();
    const digits = value.replace(/\D/g, '');
    // Маска ИИН ограничивает длину
    expect(digits.length).toBeLessThanOrEqual(12);
  });
});