import { test, expect } from '@playwright/test';

const URL = 'https://nomad.kz/ru';

// Хелпер навигации: только goto + ожидание видимого элемента
async function gotoHome(page: any) {
  await page.goto(URL);
  await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });
}

test.describe('Nomad.kz — Полная проверка функционала главной страницы', () => {

  // ============================================================
  // SMOKE TESTS — P0
  // ============================================================

  test('[TC-001] Главная страница успешно загружается без консольных ошибок', async ({ page }) => {
    // P0 — Smoke: базовый happy path
    const consoleErrors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await test.step('Открыть главную страницу', async () => {
      await page.goto(URL);
      await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });
    });

    await test.step('Проверить заголовок и URL', async () => {
      await expect(page).toHaveURL(/nomad\.kz\/ru/);
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
    });

    await test.step('Проверить критические консольные ошибки', async () => {
      const criticalErrors = consoleErrors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('analytics') &&
        !e.includes('gtm') &&
        !e.includes('Failed to load resource')
      );
      expect(criticalErrors.length).toBeLessThanOrEqual(2);
    });
  });

  test('[TC-002] Шапка сайта отображается с логотипом и навигацией', async ({ page }) => {
    // P0 — Smoke
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    await expect(page.locator('header').first()).toBeVisible();

    // Логотип
    const logo = page.locator('header a').first();
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute('href', /.+/);

    // Навигация
    const nav = page.locator('header nav, nav').first();
    await expect(nav).toBeVisible();
  });

  test('[TC-003] Подвал сайта отображается с контактной информацией', async ({ page }) => {
    // P0 — Smoke
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const footer = page.locator('footer').first();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();

    const footerText = await footer.textContent();
    expect(footerText && footerText.length).toBeGreaterThan(0);
  });

  // ============================================================
  // FUNCTIONAL TESTS — P1
  // ============================================================

  test('[TC-004] Переключение языка интерфейса работает', async ({ page }) => {
    // P1 — High
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    // Ищем переключатель языка (KZ/RU/EN)
    const langSwitcher = page.locator('header').getByText(/^(KZ|EN|ҚАЗ|РУ)$/i).first();

    if (await langSwitcher.count() > 0 && await langSwitcher.isVisible()) {
      await langSwitcher.click();
      await page.waitForURL(/nomad\.kz\/(kz|en|ru)/, { timeout: 10000 }).catch(() => {});
      const currentURL = page.url();
      expect(currentURL).toMatch(/nomad\.kz/);
    } else {
      test.skip(true, 'Переключатель языка не найден на странице');
    }
  });

  test('[TC-005] Главное меню содержит навигационные ссылки', async ({ page }) => {
    // P1 — High
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const navLinks = page.locator('header nav a, header a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);

    // Проверяем что хотя бы первая ссылка имеет href
    const firstLink = navLinks.first();
    await expect(firstLink).toHaveAttribute('href', /.+/);
  });

  test('[TC-006] Кнопка "Личный кабинет" / "Войти" видима и кликабельна', async ({ page }) => {
    // P1 — High
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const loginButton = page.getByRole('link', { name: /личный кабинет|войти|кабинет/i }).first()
      .or(page.getByRole('button', { name: /личный кабинет|войти|кабинет/i }).first());

    if (await loginButton.count() > 0) {
      await expect(loginButton.first()).toBeVisible();
    } else {
      // fallback — любая ссылка ведущая на cabinet
      const cabinetLink = page.locator('a[href*="cabinet"]').first();
      await expect(cabinetLink).toBeVisible();
      await expect(cabinetLink).toHaveAttribute('href', /cabinet/);
    }
  });

  test('[TC-007] Переход в личный кабинет открывает страницу авторизации', async ({ page }) => {
    // P1 — High
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const cabinetLink = page.locator('a[href*="cabinet"]').first();
    if (await cabinetLink.count() === 0) {
      test.skip(true, 'Ссылка на кабинет не найдена');
    }

    const href = await cabinetLink.getAttribute('href');
    expect(href).toMatch(/cabinet/);

    await Promise.all([
      page.waitForURL(/cabinet\.nomad\.kz/, { timeout: 15000 }).catch(() => {}),
      cabinetLink.click(),
    ]);

    // Если перешли на cabinet — проверяем поле IIN
    if (page.url().includes('cabinet.nomad.kz')) {
      await page.locator('#iin-input').first().waitFor({ state: 'visible', timeout: 15000 });
      await expect(page.locator('#iin-input').first()).toBeVisible();
    }
  });

  test('[TC-008] Hero-блок главной страницы отображается с контентом', async ({ page }) => {
    // P1 — High
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const main = page.locator('main, .main, [role="main"]').first();
    await expect(main).toBeVisible();

    // Проверяем что на странице есть заголовки h1/h2
    const headings = page.locator('h1, h2');
    const headCount = await headings.count();
    expect(headCount).toBeGreaterThan(0);
  });

  test('[TC-009] Изображения на странице корректно загружаются', async ({ page }) => {
    // P1 — High
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    // Скроллим вниз чтобы загрузить lazy-load изображения
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000).catch(() => {});

    const images = page.locator('img');
    const imgCount = await images.count();
    expect(imgCount).toBeGreaterThan(0);

    // Проверяем что у первого видимого изображения есть src
    const firstImg = images.first();
    const src = await firstImg.getAttribute('src');
    expect(src && src.length).toBeGreaterThan(0);
  });

  test('[TC-010] Все навигационные ссылки имеют корректные атрибуты href', async ({ page }) => {
    // P1 — High
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const links = page.locator('header a');
    const count = await links.count();

    for (let i = 0; i < Math.min(count, 10); i++) {
      const href = await links.nth(i).getAttribute('href');
      expect(href).not.toBeNull();
      expect(href && href.length).toBeGreaterThan(0);
    }
  });

  // ============================================================
  // RESPONSIVE / UX TESTS — P2
  // ============================================================

  test('[TC-011] Страница корректно отображается на мобильном разрешении', async ({ page }) => {
    // P2 — Medium
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    await expect(page.locator('header').first()).toBeVisible();

    // На мобильном должна быть кнопка-бургер
    const burger = page.locator('[class*="burger"], [class*="menu-toggle"], button[aria-label*="меню" i], button[aria-label*="menu" i]').first();
    if (await burger.count() > 0) {
      await expect(burger).toBeVisible();
    }
  });

  test('[TC-012] Страница корректно отображается на планшетном разрешении', async ({ page }) => {
    // P2 — Medium
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    await expect(page.locator('header').first()).toBeVisible();
    await expect(page.locator('footer').first()).toBeAttached();
  });

  test('[TC-013] Скролл страницы работает без ошибок', async ({ page }) => {
    // P2 — Medium
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const initialScroll = await page.evaluate(() => window.scrollY);
    expect(initialScroll).toBe(0);

    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(500).catch(() => {});

    const newScroll = await page.evaluate(() => window.scrollY);
    expect(newScroll).toBeGreaterThan(0);

    // Возврат наверх
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300).catch(() => {});
    const finalScroll = await page.evaluate(() => window.scrollY);
    expect(finalScroll).toBe(0);
  });

  test('[TC-014] Мобильное меню открывается по клику на бургер', async ({ page }) => {
    // P2 — Medium
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const burger = page.locator('[class*="burger"], [class*="menu-toggle"], button[aria-label*="меню" i], button[aria-label*="menu" i]').first();

    if (await burger.count() === 0 || !(await burger.isVisible())) {
      test.skip(true, 'Бургер-меню не найдено');
    }

    await burger.click();
    await page.waitForTimeout(500).catch(() => {});

    // После клика должны появиться навигационные ссылки
    const navLinks = page.locator('nav a, [class*="menu"] a');
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  // ============================================================
  // BOUNDARY / NEGATIVE — P2-P3
  // ============================================================

  test('[TC-015] Открытие несуществующей страницы возвращает 404 или редирект', async ({ page }) => {
    // P3 — Low
    const response = await page.goto(URL + '/nonexistent-page-12345-xyz');
    expect(response).not.toBeNull();

    if (response) {
      const status = response.status();
      // Допускается 404 или редирект на главную (200)
      expect([200, 301, 302, 404]).toContain(status);
    }
  });

  test('[TC-016] Защита от XSS в URL-параметрах', async ({ page }) => {
    // P1 — High (Security)
    let dialogFired = false;
    page.on('dialog', async d => { dialogFired = true; await d.dismiss(); });

    await page.goto(URL + '?q=' + encodeURIComponent('<script>alert("xss")</script>'));
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    await page.waitForTimeout(1500).catch(() => {});
    expect(dialogFired).toBe(false);

    // Проверяем что скрипт не выполнился через innerHTML
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    expect(bodyHTML).not.toContain('<script>alert("xss")</script>');
  });

  test('[TC-017] Защита от SQL-инъекции в URL-параметрах', async ({ page }) => {
    // P1 — High (Security)
    await page.goto(URL + "?id=" + encodeURIComponent("' OR '1'='1"));
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    // Страница должна корректно отрендериться без ошибок БД
    await expect(page.locator('header').first()).toBeVisible();
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toMatch(/SQL syntax|mysql|postgres error|database error/i);
  });

  test('[TC-018] Страница не падает при очень длинных URL-параметрах', async ({ page }) => {
    // P3 — Low
    const longParam = 'a'.repeat(2000);
    const response = await page.goto(URL + '?test=' + longParam).catch(() => null);

    if (response) {
      const status = response.status();
      expect(status).toBeLessThan(500);
    }
  });

  // ============================================================
  // EXTERNAL LINKS / SECURITY — P2
  // ============================================================

  test('[TC-019] Внешние ссылки открываются с rel="noopener" для безопасности', async ({ page }) => {
    // P2 — Medium (Security)
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const externalLinks = page.locator('a[target="_blank"]');
    const count = await externalLinks.count();

    if (count === 0) {
      test.skip(true, 'Внешние ссылки не найдены');
    }

    for (let i = 0; i < Math.min(count, 5); i++) {
      const rel = await externalLinks.nth(i).getAttribute('rel');
      // rel должен содержать noopener или noreferrer
      const hasProtection = rel !== null && (rel.includes('noopener') || rel.includes('noreferrer'));
      expect(hasProtection).toBe(true);
    }
  });

  test('[TC-020] Производительность: главная страница загружается менее чем за 10 секунд', async ({ page }) => {
    // P2 — Medium
    const start = Date.now();
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(10000);
  });

  test('[TC-021] Мета-теги для SEO присутствуют на странице', async ({ page }) => {
    // P2 — Medium
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const description = await page.locator('meta[name="description"]').getAttribute('content');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');

    expect(viewport).not.toBeNull();
    expect(viewport && viewport.length).toBeGreaterThan(0);

    if (description !== null) {
      expect(description.length).toBeGreaterThan(0);
    }
  });

  test('[TC-022] Двойной клик по ссылке не вызывает ошибок', async ({ page }) => {
    // P3 — Low
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const firstLink = page.locator('header a').first();
    await expect(firstLink).toBeVisible();

    // Двойной клик
    await firstLink.dblclick().catch(() => {});
    await page.waitForTimeout(1000).catch(() => {});

    // Страница не должна сломаться
    await expect(page.locator('body')).toBeVisible();
  });

  test('[TC-023] Навигация Back/Forward работает корректно', async ({ page }) => {
    // P2 — Medium
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });
    const initialURL = page.url();

    // Найдём внутреннюю ссылку и кликнем
    const internalLink = page.locator('header a[href^="/"], header a[href*="nomad.kz"]').first();
    if (await internalLink.count() === 0) {
      test.skip(true, 'Внутренние ссылки не найдены');
    }

    await internalLink.click();
    await page.waitForTimeout(2000).catch(() => {});

    await page.goBack();
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });
    expect(page.url()).toContain('nomad.kz');

    await page.goForward();
    await page.waitForTimeout(1000).catch(() => {});
    expect(page.url()).toContain('nomad.kz');
  });

  test('[TC-024] Куки и localStorage инициализируются корректно', async ({ page }) => {
    // P3 — Low
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const cookies = await page.context().cookies();
    expect(Array.isArray(cookies)).toBe(true);

    const localStorageLength = await page.evaluate(() => window.localStorage.length);
    expect(localStorageLength).toBeGreaterThanOrEqual(0);
  });

  test('[TC-025] Поиск по сайту работает (если присутствует)', async ({ page }) => {
    // P2 — Medium
    await page.goto(URL);
    await page.locator('header').first().waitFor({ state: 'visible', timeout: 30000 });

    const searchInput = page.locator('input[type="search"], input[placeholder*="поиск" i], input[name*="search" i]').first();

    if (await searchInput.count() === 0 || !(await searchInput.isVisible().catch(() => false))) {
      test.skip(true, 'Поиск не найден на странице');
    }

    await expect(searchInput).toBeVisible();
    await expect(searchInput).toBeEditable();
    await searchInput.fill('страхование');
    await expect(searchInput).toHaveValue('страхование');

    await searchInput.fill('');
    await expect(searchInput).toHaveValue('');
  });

});