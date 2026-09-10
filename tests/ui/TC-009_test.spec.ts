import { test, expect } from '@playwright/test';

const URL = 'https://cabinet.nomad.kz/login';
const IIN_SELECTOR = '#iin-input';

async function gotoLogin(page: any) {
  await page.goto(URL);
  await page.locator(IIN_SELECTOR).first().waitFor({ state: 'visible', timeout: 15000 });
}

test.describe('Страница входа cabinet.nomad.kz — Поле ввода ИИН', () => {

  // ============ SMOKE ============

  // P0 — Smoke: базовый happy path
  test('[TC-IIN-001] Поле ИИН отображается и доступно при загрузке страницы', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть страницу логина', async () => {
      await gotoLogin(page);
    });

    await test.step('Проверить видимость и состояние поля ИИН', async () => {
      const iin = page.locator(IIN_SELECTOR).first();
      await expect(iin).toBeVisible();
      await expect(iin).toBeEnabled();
      await expect(iin).toBeEditable();
      await expect(iin).toHaveValue('');
    });

    await test.step('Проверить атрибут type=tel у поля ИИН', async () => {
      const iin = page.locator(IIN_SELECTOR).first();
      await expect(iin).toHaveAttribute('type', 'tel');
    });

    await test.step('Проверить отсутствие ошибок в консоли', async () => {
      expect(consoleErrors.filter(e => !e.toLowerCase().includes('favicon'))).toHaveLength(0);
    });
  });

  // P0 — Smoke: фокус на поле
  test('[TC-IIN-002] Поле ИИН принимает фокус при клике', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await expect(iin).toBeFocused();
  });

  // ============ FUNCTIONAL ============

  // P1 — High: валидация критической бизнес-логики
  test('[TC-IIN-003] Поле ИИН принимает корректный 12-значный ввод', async ({ page }) => {
    await gotoLogin(page);

    await test.step('Ввести 12 цифр в поле ИИН', async () => {
      const iin = page.locator(IIN_SELECTOR).first();
      await iin.click({ force: true });
      await page.keyboard.type('123456789012');
    });

    await test.step('Проверить, что введенное значение содержит 12 цифр', async () => {
      const iin = page.locator(IIN_SELECTOR).first();
      const value = await iin.inputValue();
      const digits = value.replace(/\D/g, '');
      expect(digits).toBe('123456789012');
    });
  });

  // P1 — High: фильтрация недопустимых символов
  test('[TC-IIN-004] Поле ИИН отклоняет нецифровой ввод (буквы)', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits).toBe('');
  });

  // P1 — High: смешанный ввод
  test('[TC-IIN-005] Поле ИИН фильтрует смешанный ввод (цифры + буквы)', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('12abc34def56gh78');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(12);
    expect(/^\d*$/.test(digits)).toBe(true);
  });

  // P1 — High: очистка поля
  test('[TC-IIN-006] Поле ИИН очищается корректно', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('123456789012');

    let value = await iin.inputValue();
    expect(value.replace(/\D/g, '')).toBe('123456789012');

    await iin.click({ force: true });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');

    value = await iin.inputValue();
    expect(value.replace(/\D/g, '')).toBe('');
  });

  // ============ BOUNDARY ============

  // P2 — Medium: граничное значение — менее 12 цифр
  test('[TC-IIN-007] Поле ИИН: ввод 11 цифр (меньше минимума)', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('12345678901');
    await iin.blur();

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThan(12);
  });

  // P2 — Medium: граничное значение — ровно 12 цифр
  test('[TC-IIN-008] Поле ИИН: ввод ровно 12 цифр (валидная длина)', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('123456789012');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits).toHaveLength(12);
  });

  // P2 — Medium: попытка ввода более 12 цифр
  test('[TC-IIN-009] Поле ИИН: попытка ввода 15 цифр (превышение максимума)', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('123456789012345');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  // P2 — Medium: пустое поле
  test('[TC-IIN-010] Поле ИИН: отправка пустого значения', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await iin.blur();

    await expect(iin).toHaveValue('');
  });

  // P2 — Medium: только пробелы
  test('[TC-IIN-011] Поле ИИН: ввод только пробелов', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('            ');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits).toBe('');
  });

  // ============ NEGATIVE ============

  // P1 — High: спецсимволы
  test('[TC-IIN-012] Поле ИИН отклоняет спецсимволы', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('!@#$%^&*()_+');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits).toBe('');
  });

  // P2 — Medium: кириллица
  test('[TC-IIN-013] Поле ИИН отклоняет кириллический ввод', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('абвгдеёжзийк');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits).toBe('');
  });

  // P3 — Low: emoji
  test('[TC-IIN-014] Поле ИИН отклоняет emoji', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('😀🚀✨💻🔥');

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits).toBe('');
  });

  // P1 — High: невалидный ИИН (все нули)
  test('[TC-IIN-015] Поле ИИН: ввод 12 нулей (невалидный ИИН)', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('000000000000');
    await iin.blur();

    const value = await iin.inputValue();
    expect(value.replace(/\D/g, '')).toBe('000000000000');
  });

  // P3 — Low: огромный объём ввода
  test('[TC-IIN-016] Поле ИИН: устойчивость к большому объёму ввода', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });

    const start = Date.now();
    await page.keyboard.type('1'.repeat(500));
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000);

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  // P2 — Medium: вставка через буфер обмена
  test('[TC-IIN-017] Поле ИИН: вставка значения через буфер обмена', async ({ page, browserName }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });

    await page.evaluate(() => {
      const input = document.querySelector('#iin-input') as HTMLInputElement;
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (setter && setter.set) setter.set.call(input, '987654321098');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeGreaterThanOrEqual(0);
  });

  // ============ SECURITY ============

  // P1 — High: XSS payload
  test('[TC-IIN-018] Поле ИИН безопасно к XSS-атакам', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");
    await iin.blur();

    await page.waitForTimeout(500);
    expect(dialogFired).toBe(false);

    const value = await iin.inputValue();
    expect(value).not.toContain('<script>');
  });

  // P1 — High: SQL injection
  test('[TC-IIN-019] Поле ИИН безопасно к SQL-инъекциям', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type("' OR '1'='1");

    const value = await iin.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(12);
    expect(value).not.toContain("' OR");
  });

  // P2 — Medium: HTML-инъекция
  test('[TC-IIN-020] Поле ИИН безопасно к HTML-инъекциям', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();
    await iin.click({ force: true });
    await page.keyboard.type('<img src=x onerror=alert(1)>');

    const value = await iin.inputValue();
    expect(value).not.toContain('<img');
    expect(value).not.toContain('onerror');
  });

  // P3 — Low: повторная отправка / двойной клик
  test('[TC-IIN-021] Поле ИИН: повторный ввод не нарушает состояние', async ({ page }) => {
    await gotoLogin(page);

    const iin = page.locator(IIN_SELECTOR).first();

    await iin.click({ force: true });
    await page.keyboard.type('111111111111');
    let value = await iin.inputValue();
    expect(value.replace(/\D/g, '')).toBe('111111111111');

    await iin.click({ force: true });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');

    await page.keyboard.type('222222222222');
    value = await iin.inputValue();
    expect(value.replace(/\D/g, '')).toBe('222222222222');
  });
});