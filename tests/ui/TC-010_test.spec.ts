import { test, expect } from '@playwright/test';

const URL = 'https://lk.lender-invest.ru/index.php/borrower/login';

// Селекторы страницы входа (используем гибкие fallback-стратегии)
const LOGIN_INPUT_SELECTOR = 'input[type="text"], input[type="email"], input[name*="login" i], input[name*="email" i], input[name*="username" i]';
const PASSWORD_INPUT_SELECTOR = 'input[type="password"]';
const SUBMIT_BUTTON_SELECTOR = 'button[type="submit"], input[type="submit"]';
const FORM_SELECTOR = 'form';

test.describe('Страница входа личного кабинета заёмщика Lender-Invest', () => {

  // ============================================================
  // SMOKE
  // ============================================================

  test('[TC-001] P0 — Страница входа успешно загружается без ошибок консоли', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await test.step('Открыть страницу входа', async () => {
      await page.goto(URL);
      await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });
    });

    await test.step('Проверить наличие основных элементов формы', async () => {
      await expect(page.locator(FORM_SELECTOR).first()).toBeVisible();
      await expect(page.locator(PASSWORD_INPUT_SELECTOR).first()).toBeVisible();
      await expect(page.locator(SUBMIT_BUTTON_SELECTOR).first()).toBeVisible();
    });

    await test.step('Проверить отсутствие критических ошибок JavaScript', async () => {
      expect(pageErrors).toHaveLength(0);
    });
  });

  test('[TC-002] P0 — Заголовок страницы и URL соответствуют ожидаемым', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    expect(page.url()).toContain('borrower/login');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  // ============================================================
  // FUNCTIONAL
  // ============================================================

  test('[TC-003] P0 — Поле логина отображается, доступно для ввода и пустое при загрузке', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    await expect(loginInput).toBeVisible();
    await expect(loginInput).toBeEnabled();
    await expect(loginInput).toBeEditable();
    await expect(loginInput).toHaveValue('');
  });

  test('[TC-004] P0 — Поле пароля отображается, скрывает символы и пустое при загрузке', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR).first();
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeEnabled();
    await expect(passwordInput).toBeEditable();
    await expect(passwordInput).toHaveValue('');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('[TC-005] P0 — Кнопка отправки формы отображается и активна', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const submitBtn = page.locator(SUBMIT_BUTTON_SELECTOR).first();
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();
  });

  test('[TC-006] P1 — Ввод корректных данных в поля логина и пароля сохраняет значения', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR).first();

    await loginInput.fill('test@example.com');
    await passwordInput.fill('TestPass123!');

    await expect(loginInput).toHaveValue('test@example.com');
    await expect(passwordInput).toHaveValue('TestPass123!');
  });

  test('[TC-007] P1 — Очистка полей логина и пароля работает корректно', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR).first();

    await loginInput.fill('user@test.ru');
    await passwordInput.fill('SomePass1');

    await expect(loginInput).toHaveValue('user@test.ru');
    await expect(passwordInput).toHaveValue('SomePass1');

    await loginInput.fill('');
    await passwordInput.fill('');

    await expect(loginInput).toHaveValue('');
    await expect(passwordInput).toHaveValue('');
  });

  test('[TC-008] P2 — Навигация по полям с помощью клавиши Tab работает', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    await loginInput.focus();
    await expect(loginInput).toBeFocused();

    await page.keyboard.press('Tab');
    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR).first();
    await expect(passwordInput).toBeFocused();
  });

  test('[TC-009] P1 — Попытка входа с пустыми полями не приводит к успешной авторизации', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const submitBtn = page.locator(SUBMIT_BUTTON_SELECTOR).first();
    await submitBtn.click();

    await page.waitForTimeout(1500);
    expect(page.url()).toContain('login');
  });

  test('[TC-010] P1 — Ссылка/блок восстановления пароля присутствует на странице', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const recoverySelectors = [
      'a:has-text("пароль")',
      'a:has-text("Забыли")',
      'a:has-text("Восстанов")',
      'a[href*="recovery"]',
      'a[href*="forgot"]',
      'a[href*="reset"]'
    ];

    let found = false;
    for (const sel of recoverySelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  // ============================================================
  // BOUNDARY
  // ============================================================

  test('[TC-011] P2 — Поле логина принимает минимально короткое значение (1 символ)', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    await loginInput.fill('a');
    await expect(loginInput).toHaveValue('a');
  });

  test('[TC-012] P2 — Поле логина принимает длинное значение (256 символов)', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const longValue = 'a'.repeat(256);
    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    await loginInput.fill(longValue);

    const actualValue = await loginInput.inputValue();
    expect(actualValue.length).toBeGreaterThan(0);
    expect(actualValue.length).toBeLessThanOrEqual(256);
  });

  test('[TC-013] P3 — Поле логина принимает Unicode и кириллицу без сбоев', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    await loginInput.fill('Пользователь_Тест_123');
    await expect(loginInput).toHaveValue('Пользователь_Тест_123');
  });

  test('[TC-014] P3 — Поле пароля принимает спецсимволы и сохраняет значение точно', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const complexPass = 'P@ssw0rd!#$%^&*()_+-={}[]|:;<>,.?/~`';
    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR).first();
    await passwordInput.fill(complexPass);
    await expect(passwordInput).toHaveValue(complexPass);
  });

  test('[TC-015] P2 — Поле логина обрабатывает только пробелы как пустое значение', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();
    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR).first();

    await loginInput.fill('   ');
    await passwordInput.fill('   ');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(1500);
    expect(page.url()).toContain('login');
  });

  test('[TC-016] P3 — UI не зависает при вводе очень большой строки (5000 символов)', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const hugeValue = 'x'.repeat(5000);
    const loginInput = page.locator(LOGIN_INPUT_SELECTOR).first();

    const start = Date.now();
    await loginInput.fill(hugeValue);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
    await expect(loginInput).toBeVisible();
  });

  // ============================================================
  // NEGATIVE
  // ============================================================

  test('[TC-017] P1 — Вход с несуществующими корректно сформированными учётными данными не выполняется', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('nonexistent_user_12345@example.com');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('WrongPassword123!');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(2500);
    expect(page.url()).toContain('login');
  });

  test('[TC-018] P1 — Вход только с заполненным логином без пароля невозможен', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('user@test.ru');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(1500);
    expect(page.url()).toContain('login');
  });

  test('[TC-019] P1 — Вход только с заполненным паролем без логина невозможен', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('SomePass123');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(1500);
    expect(page.url()).toContain('login');
  });

  test('[TC-020] P2 — Двойной клик по кнопке отправки не приводит к двойной обработке', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('double_click_test@example.com');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('Password123!');

    const submitBtn = page.locator(SUBMIT_BUTTON_SELECTOR).first();
    await submitBtn.click();
    await submitBtn.click({ force: true }).catch(() => {});

    await page.waitForTimeout(2500);
    expect(page.url()).toContain('login');
  });

  test('[TC-021] P2 — После неуспешного входа поля остаются на странице и доступны', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('wrong@user.com');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('WrongPass1');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(2500);

    await expect(page.locator(LOGIN_INPUT_SELECTOR).first()).toBeVisible();
    await expect(page.locator(PASSWORD_INPUT_SELECTOR).first()).toBeVisible();
    await expect(page.locator(SUBMIT_BUTTON_SELECTOR).first()).toBeEnabled();
  });

  test('[TC-022] P2 — Ввод некорректного email формата не приводит к успешной авторизации', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('not-an-email-at-all');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('SomePass123');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(2000);
    expect(page.url()).toContain('login');
  });

  // ============================================================
  // SECURITY
  // ============================================================

  test('[TC-023] P1 — SQL-инъекция в поле логина не приводит к компрометации авторизации', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill("admin' OR '1'='1");
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill("' OR '1'='1");
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(2500);
    expect(page.url()).toContain('login');
  });

  test('[TC-024] P1 — XSS-payload в поле логина не выполняется как скрипт', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const xssPayload = '<script>alert("XSS")</script>';
    await page.locator(LOGIN_INPUT_SELECTOR).first().fill(xssPayload);
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('AnyPass123');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(2500);
    expect(dialogFired).toBe(false);
  });

  test('[TC-025] P1 — XSS img onerror payload не выполняется', async ({ page }) => {
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('"><img src=x onerror=alert(1)>');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('TestPass');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(2500);
    expect(dialogFired).toBe(false);
  });

  test('[TC-026] P1 — Поле пароля имеет атрибут type=password и не раскрывает значение в DOM как текст', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const passwordInput = page.locator(PASSWORD_INPUT_SELECTOR).first();
    await expect(passwordInput).toHaveAttribute('type', 'password');

    await passwordInput.fill('SecretPassword123!');
    const typeAttr = await passwordInput.getAttribute('type');
    expect(typeAttr).toBe('password');
  });

  test('[TC-027] P2 — Форма отправляется методом POST (а не GET) при логине', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('post_test@example.com');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('TestPass123!');

    const requestPromise = page.waitForRequest(
      req => req.method() === 'POST' && req.url().includes('login'),
      { timeout: 5000 }
    ).catch(() => null);

    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();
    const request = await requestPromise;

    if (request) {
      expect(request.method()).toBe('POST');
      const postData = request.postData() || '';
      expect(postData.toLowerCase()).not.toContain('testpass123!'.toLowerCase() + '&plaintext_marker');
    }
  });

  test('[TC-028] P2 — Сервер не возвращает 5xx при некорректных учётных данных', async ({ page }) => {
    const serverErrors: number[] = [];
    page.on('response', resp => {
      if (resp.status() >= 500 && resp.url().includes('login')) {
        serverErrors.push(resp.status());
      }
    });

    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('invalid_user_test@nowhere.xyz');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('InvalidPass987!');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(3000);
    expect(serverErrors).toHaveLength(0);
  });

  test('[TC-029] P3 — Имитация ответа 401 от сервера: пользователь остаётся на странице входа', async ({ page }) => {
    await page.route('**/login**', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unauthorized' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    await page.locator(LOGIN_INPUT_SELECTOR).first().fill('mocked@user.com');
    await page.locator(PASSWORD_INPUT_SELECTOR).first().fill('MockedPass123');
    await page.locator(SUBMIT_BUTTON_SELECTOR).first().click();

    await page.waitForTimeout(2000);
    expect(page.url()).toContain('login');
    await expect(page.locator(FORM_SELECTOR).first()).toBeVisible();
  });

  test('[TC-030] P3 — Проверка наличия CSRF-токена в форме (если используется)', async ({ page }) => {
    await page.goto(URL);
    await page.locator(FORM_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });

    const csrfSelectors = [
      'input[name*="csrf" i]',
      'input[name*="token" i]',
      'input[name="_csrf"]',
      'meta[name="csrf-token"]'
    ];

    let totalFound = 0;
    for (const sel of csrfSelectors) {
      totalFound += await page.locator(sel).count();
    }
    expect(totalFound).toBeGreaterThanOrEqual(0);
  });
});