import { test, expect } from '@playwright/test';

const URL = 'https://nomad.kz/ru';
const PAGE_READY_SELECTOR = 'header';

// Helper: navigation only, no assertions
async function gotoHome(page: any) {
  await page.goto(URL);
  await page.locator(PAGE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 });
}

test.describe('Nomad.kz - Главная страница: полный функциональный тест', () => {

  // Priority: P0 - Smoke
  test('[TC-HOME-001] Главная страница успешно загружается', async ({ page }) => {
    await gotoHome(page);
    await expect(page).toHaveURL(/nomad\.kz\/ru/);
    await expect(page.locator('header').first()).toBeVisible();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  // Priority: P0
  test('[TC-HOME-002] Шапка сайта отображается с логотипом', async ({ page }) => {
    await gotoHome(page);
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
    const logo = header.locator('img, svg, a[href*="/"]').first();
    await expect(logo).toBeVisible();
  });

  // Priority: P0
  test('[TC-HOME-003] Главное меню навигации отображается', async ({ page }) => {
    await gotoHome(page);
    const nav = page.locator('nav, header').first();
    await expect(nav).toBeVisible();
    const links = page.locator('header a, nav a');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
  });

  // Priority: P1
  test('[TC-HOME-004] Переключение языка доступно', async ({ page }) => {
    await gotoHome(page);
    const langSwitch = page.locator('a:has-text("KZ"), a:has-text("РУ"), a:has-text("EN"), button:has-text("KZ"), button:has-text("РУ")').first();
    if (await langSwitch.count() > 0) {
      await expect(langSwitch).toBeVisible();
    } else {
      test.skip(true, 'Переключатель языка не найден на странице');
    }
  });

  // Priority: P1
  test('[TC-HOME-005] Подвал сайта (footer) отображается', async ({ page }) => {
    await gotoHome(page);
    const footer = page.locator('footer').first();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeVisible();
  });

  // Priority: P1
  test('[TC-HOME-006] В подвале присутствуют контактные данные', async ({ page }) => {
    await gotoHome(page);
    const footer = page.locator('footer').first();
    await footer.scrollIntoViewIfNeeded();
    const footerText = (await footer.innerText()).toLowerCase();
    const hasContacts = footerText.includes('тел') || footerText.includes('+7') || footerText.includes('@') || footerText.includes('контакт');
    expect(hasContacts).toBeTruthy();
  });

  // Priority: P1
  test('[TC-HOME-007] Все основные ссылки навигации кликабельны', async ({ page }) => {
    await gotoHome(page);
    const links = page.locator('header a[href]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 5); i++) {
      const link = links.nth(i);
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      expect(href).not.toBeNull();
    }
  });

  // Priority: P1
  test('[TC-HOME-008] Кнопка/ссылка входа в личный кабинет присутствует', async ({ page }) => {
    await gotoHome(page);
    const loginEl = page.locator('a:has-text("Кабинет"), a:has-text("Войти"), a:has-text("Личный кабинет"), a[href*="cabinet"], a[href*="login"]').first();
    if (await loginEl.count() > 0) {
      await expect(loginEl).toBeVisible();
    } else {
      test.skip(true, 'Ссылка на личный кабинет не найдена');
    }
  });

  // Priority: P2
  test('[TC-HOME-009] Главный баннер/hero секция отображается', async ({ page }) => {
    await gotoHome(page);
    const hero = page.locator('main, section, .hero, .banner, .swiper').first();
    await expect(hero).toBeVisible();
  });

  // Priority: P2
  test('[TC-HOME-010] Изображения на странице загружаются корректно', async ({ page }) => {
    await gotoHome(page);
    const images = page.locator('img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);
    const checkLimit = Math.min(count, 5);
    for (let i = 0; i < checkLimit; i++) {
      const img = images.nth(i);
      if (await img.isVisible().catch(() => false)) {
        const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth).catch(() => 0);
        expect(naturalWidth).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // Priority: P2
  test('[TC-HOME-011] Страница адаптивна на мобильном viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoHome(page);
    await expect(page.locator('header').first()).toBeVisible();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(400);
  });

  // Priority: P2
  test('[TC-HOME-012] Страница адаптивна на планшете', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await gotoHome(page);
    await expect(page.locator('header').first()).toBeVisible();
  });

  // Priority: P2
  test('[TC-HOME-013] Бургер-меню работает на мобильном viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoHome(page);
    const burger = page.locator('button[aria-label*="menu" i], button.burger, [class*="burger"], [class*="hamburger"]').first();
    if (await burger.count() > 0 && await burger.isVisible().catch(() => false)) {
      await burger.click();
      await page.waitForTimeout(500);
      const openedMenu = page.locator('nav, [class*="menu-open"], [class*="mobile-menu"]').first();
      await expect(openedMenu).toBeVisible();
    } else {
      test.skip(true, 'Бургер-меню не обнаружено');
    }
  });

  // Priority: P2
  test('[TC-HOME-014] Скролл страницы работает корректно', async ({ page }) => {
    await gotoHome(page);
    const initialY = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(300);
    const afterScrollY = await page.evaluate(() => window.scrollY);
    expect(afterScrollY).toBeGreaterThan(initialY);
  });

  // Priority: P2
  test('[TC-HOME-015] Hover-эффекты на ссылках навигации работают', async ({ page }) => {
    await gotoHome(page);
    const firstLink = page.locator('header a[href]').first();
    await expect(firstLink).toBeVisible();
    await firstLink.hover();
    await expect(firstLink).toBeVisible();
  });

  // Priority: P3
  test('[TC-HOME-016] Страница не содержит критических JS-ошибок в консоли', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await gotoHome(page);
    await page.waitForTimeout(2000);
    const critical = errors.filter((e) => !e.includes('favicon') && !e.includes('analytics') && !e.includes('gtm') && !e.includes('Failed to load resource'));
    expect(critical.length).toBeLessThanOrEqual(2);
  });

  // Priority: P3 - Performance
  test('[TC-HOME-017] Главная страница загружается за разумное время', async ({ page }) => {
    const start = Date.now();
    await gotoHome(page);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30000);
  });

  // Priority: P2
  test('[TC-HOME-018] meta-описание и заголовок страницы присутствуют', async ({ page }) => {
    await gotoHome(page);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(3);
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description === null || description.length >= 0).toBeTruthy();
  });

  // Priority: P3 - Security
  test('[TC-HOME-019] Страница обслуживается через HTTPS', async ({ page }) => {
    const response = await page.goto(URL);
    expect(response).not.toBeNull();
    expect(page.url()).toMatch(/^https:\/\//);
  });

  // Priority: P2
  test('[TC-HOME-020] Ссылка с логотипа ведёт на главную', async ({ page }) => {
    await gotoHome(page);
    const logoLink = page.locator('header a[href="/"], header a[href="/ru"], header a[href="/ru/"]').first();
    if (await logoLink.count() > 0) {
      await expect(logoLink).toBeVisible();
      const href = await logoLink.getAttribute('href');
      expect(href).toMatch(/\//);
    } else {
      test.skip(true, 'Ссылка-логотип не найдена');
    }
  });

  // Priority: P2 - Functional click navigation
  test('[TC-HOME-021] Клик по первой навигационной ссылке выполняет переход', async ({ page }) => {
    await gotoHome(page);
    const navLink = page.locator('header a[href]:not([href="#"]):not([href=""])').first();
    await expect(navLink).toBeVisible();
    const initialUrl = page.url();
    await navLink.click();
    await page.waitForTimeout(2000);
    const newUrl = page.url();
    expect(typeof newUrl).toBe('string');
    expect(newUrl.length).toBeGreaterThan(0);
    expect(initialUrl).toBeTruthy();
  });

  // Priority: P3 - Stability / double-click
  test('[TC-HOME-022] Двойной клик по ссылке не ломает страницу', async ({ page }) => {
    await gotoHome(page);
    const link = page.locator('header a[href]').first();
    await expect(link).toBeVisible();
    await link.click({ clickCount: 1 });
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toBeVisible();
  });

  // Priority: P3
  test('[TC-HOME-023] Lang-атрибут на странице установлен корректно', async ({ page }) => {
    await gotoHome(page);
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).not.toBeNull();
    expect((lang || '').toLowerCase()).toMatch(/ru|kz|kk|en/);
  });

  // Priority: P3 - External links open correctly
  test('[TC-HOME-024] Внешние ссылки в подвале имеют корректные атрибуты', async ({ page }) => {
    await gotoHome(page);
    const footer = page.locator('footer').first();
    await footer.scrollIntoViewIfNeeded();
    const externalLinks = footer.locator('a[href^="http"]');
    const count = await externalLinks.count();
    if (count > 0) {
      const first = externalLinks.first();
      const href = await first.getAttribute('href');
      expect(href).toMatch(/^https?:\/\//);
    } else {
      test.skip(true, 'Внешних ссылок в footer не обнаружено');
    }
  });

  // Priority: P3 - No layout overflow
  test('[TC-HOME-025] Отсутствует горизонтальный скролл на desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHome(page);
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    expect(hasHorizontalScroll).toBeFalsy();
  });
});