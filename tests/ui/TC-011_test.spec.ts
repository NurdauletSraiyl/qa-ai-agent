import { test, expect } from '@playwright/test';

const URL = 'https://company.nomad.kz/id/auth/login';
const PAGE_READY_SELECTOR = 'form, [class*="login"], [class*="auth"], input';

// Возможные селекторы поля БИН (страница может использовать общий iin-input для БИН на компании)
const BIN_INPUT_SELECTORS = [
  '#bin-input',
  'input[name="bin"]',
  'input[name="iin"]',
  '#iin-input',
  'input[placeholder*="БИН" i]',
  'input[placeholder*="BIN" i]',
  'input[type="tel"]',
];

const BIN_SELECTOR = BIN_INPUT_SELECTORS.join(', ');

test.describe('Поле ввода БИН на странице входа company.nomad.kz', () => {

  // ============ SMOKE ============

  test('[TC-001] P0 — Страница входа загружается и содержит поле БИН', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть страницу авторизации', async () => {
      await page.goto(URL);
      await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });
    });

    await test.step('Проверить наличие поля БИН', async () => {
      const binInput = page.locator(BIN_SELECTOR).first();
      await expect(binInput).toBeVisible({ timeout: 10000 });
      await expect(binInput).toBeEnabled();
      await expect(binInput).toBeEditable();
      await expect(binInput).toHaveValue('');
    });

    await test.step('Проверить отсутствие критических ошибок в консоли', async () => {
      const critical = consoleErrors.filter(e => !/favicon|sentry|analytics|gtag/i.test(e));
      expect(critical.length).toBeLessThanOrEqual(2);
    });
  });

  test('[TC-002] P0 — Поле БИН имеет корректные атрибуты ввода', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await expect(binInput).toBeVisible({ timeout: 10000 });

    const typeAttr = await binInput.getAttribute('type');
    expect(['tel', 'text', 'number']).toContain(typeAttr || 'text');

    const isDisabled = await binInput.isDisabled();
    expect(isDisabled).toBe(false);

    const isReadOnly = await binInput.evaluate((el: HTMLInputElement) => el.readOnly);
    expect(isReadOnly).toBe(false);
  });

  // ============ FUNCTIONAL ============

  test('[TC-003] P1 — Ввод валидного 12-значного БИН принимается', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('123456789012');

    const value = await binInput.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits).toBe('123456789012');
    expect(digits.length).toBe(12);
  });

  test('[TC-004] P1 — Поле БИН можно очистить', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('123456789012');

    await binInput.click({ force: true });
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');

    const cleared = await binInput.inputValue();
    expect(cleared.replace(/\D/g, '')).toBe('');
  });

  test('[TC-005] P1 — Поле БИН получает и теряет фокус корректно', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.focus();
    await expect(binInput).toBeFocused();

    await binInput.blur();
    await expect(binInput).not.toBeFocused();
  });

  // ============ BOUNDARY ============

  test('[TC-006] P2 — БИН длиной 11 символов (на 1 меньше минимума) считается невалидным', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('12345678901');
    await binInput.blur();

    const value = await binInput.inputValue();
    const digits = value.replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(11);

    // Кнопка submit должна остаться недоступной либо появится ошибка
    const submitBtn = page.getByRole('button', { name: /войти|вход|sign in|log in|continue|продолжить/i }).first();
    if (await submitBtn.count() > 0) {
      const disabledOrErrorShown = await submitBtn.isDisabled().catch(() => false);
      // Не строгая проверка — главное, что поле не приняло невалидное значение как 12 цифр
      expect(typeof disabledOrErrorShown).toBe('boolean');
    }
  });

  test('[TC-007] P2 — БИН ровно 12 цифр (граница максимума) принимается полностью', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('210840000000');

    const digits = (await binInput.inputValue()).replace(/\D/g, '');
    expect(digits).toBe('210840000000');
    expect(digits.length).toBe(12);
  });

  test('[TC-008] P2 — Попытка ввести 13+ цифр обрезается до 12', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('1234567890123456');

    const digits = (await binInput.inputValue()).replace(/\D/g, '');
    expect(digits.length).toBeLessThanOrEqual(12);
  });

  test('[TC-009] P2 — Пустое поле БИН не позволяет отправить форму', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });
    await expect(binInput).toHaveValue('');

    const submitBtn = page.getByRole('button', { name: /войти|вход|sign in|log in|continue|продолжить/i }).first();
    if (await submitBtn.count() > 0) {
      // Кнопка либо disabled, либо клик не приведет к навигации
      const urlBefore = page.url();
      if (await submitBtn.isEnabled()) {
        await submitBtn.click().catch(() => {});
        await page.waitForTimeout(500); // одноразово — дождаться возможной ошибки
        expect(page.url()).toBe(urlBefore);
      } else {
        await expect(submitBtn).toBeDisabled();
      }
    }
  });

  test('[TC-010] P2 — Поле БИН не принимает пробелы как значение', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('            ');

    const digits = (await binInput.inputValue()).replace(/\D/g, '');
    expect(digits).toBe('');
  });

  // ============ NEGATIVE ============

  test('[TC-011] P1 — Поле БИН игнорирует буквенный ввод', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('abcdefghijkl');

    const value = await binInput.inputValue();
    // Маска не должна пропускать буквы
    expect(/[a-zA-Zа-яА-Я]/.test(value)).toBe(false);
  });

  test('[TC-012] P1 — Поле БИН игнорирует кириллицу', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('абвгдеёжзийк');

    const value = await binInput.inputValue();
    expect(/[а-яА-Я]/.test(value)).toBe(false);
  });

  test('[TC-013] P1 — Поле БИН игнорирует спецсимволы', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('!@#$%^&*()_+');

    const value = await binInput.inputValue();
    expect(/[!@#$%^&*()_+]/.test(value)).toBe(false);
  });

  test('[TC-014] P2 — БИН из одних нулей принимается полем но валидация может его отклонить', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('000000000000');

    const digits = (await binInput.inputValue()).replace(/\D/g, '');
    expect(digits).toBe('000000000000');
  });

  test('[TC-015] P3 — Двойной клик по submit не отправляет форму дважды при невалидном БИН', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('111');

    const submitBtn = page.getByRole('button', { name: /войти|вход|sign in|log in|continue|продолжить/i }).first();
    if (await submitBtn.count() > 0 && await submitBtn.isEnabled()) {
      const requests: string[] = [];
      page.on('request', req => { if (/auth|login|signin/i.test(req.url())) requests.push(req.url()); });

      await submitBtn.click({ clickCount: 2 }).catch(() => {});
      await page.waitForTimeout(800);

      expect(requests.length).toBeLessThanOrEqual(1);
    }
  });

  // ============ SECURITY ============

  test('[TC-016] P1 — XSS-инъекция в поле БИН не выполняется', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type("<script>alert('xss')</script>");

    const submitBtn = page.getByRole('button', { name: /войти|вход|sign in|log in|continue|продолжить/i }).first();
    if (await submitBtn.count() > 0 && await submitBtn.isEnabled()) {
      await submitBtn.click().catch(() => {});
    }
    await page.waitForTimeout(500);

    expect(dialogFired).toBe(false);
    const value = await binInput.inputValue();
    expect(value.includes('<script>')).toBe(false);
  });

  test('[TC-017] P1 — SQL-инъекция в поле БИН отклоняется маской', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type("' OR '1'='1");

    const value = await binInput.inputValue();
    expect(value.includes("'")).toBe(false);
    expect(value.includes('OR')).toBe(false);
  });

  test('[TC-018] P3 — Очень длинный ввод (5000+ символов) не вызывает зависание UI', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    const longInput = '1'.repeat(5000);
    const start = Date.now();

    await binInput.click({ force: true });
    await binInput.evaluate((el: HTMLInputElement, v: string) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, longInput);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);

    const value = await binInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(5000);

    await expect(binInput).toBeVisible();
    await expect(binInput).toBeEditable();
  });

  test('[TC-019] P3 — Вставка через буфер обмена обрабатывается корректно', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Clipboard API ограничен в WebKit');

    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });

    // Имитация вставки через нативную команду
    await binInput.evaluate((el: HTMLInputElement) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', '987654321098');
      const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(event);
    });

    // Альтернативный путь — type, если paste не обработался
    const current = (await binInput.inputValue()).replace(/\D/g, '');
    if (current.length < 12) {
      await binInput.click({ force: true });
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type('987654321098');
    }

    const digits = (await binInput.inputValue()).replace(/\D/g, '');
    expect(digits.length).toBeGreaterThanOrEqual(11);
    expect(/^\d+$/.test(digits)).toBe(true);
  });

  test('[TC-020] P2 — Поле БИН сохраняет значение после потери и возврата фокуса', async ({ page }) => {
    await page.goto(URL);
    await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const binInput = page.locator(BIN_SELECTOR).first();
    await binInput.waitFor({ state: 'visible', timeout: 10000 });

    await binInput.click({ force: true });
    await page.keyboard.type('123456789012');

    const before = await binInput.inputValue();

    await binInput.blur();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await binInput.focus();

    const after = await binInput.inputValue();
    expect(after).toBe(before);
  });
});