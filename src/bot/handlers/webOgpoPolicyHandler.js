'use strict';

const { chromium } = require('playwright');
// Если путь до progress другой, поправь его (обычно это '../progress')
const { Progress } = require('../progress'); 

async function handleWebOgpo(ctx, args) {
  // 1. Проверяем, что пользователь передал нужные данные
  if (args.length < 2) {
    return ctx.reply(
      '⚠️ Использование: `web ogpo <ИИН> <Госномер>`\nПример: `web ogpo 010101555555 123AAA02`',
      { parse_mode: 'Markdown' }
    );
  }

  const iin = args[0];
  const carNumber = args[1];
  let progress = null;
  let browser = null;

  try {
    progress = await new Progress(ctx, '🤖 Запускаю виртуальный браузер...').start();

    // 2. Поднимаем Playwright браузер
    browser = await chromium.launch({ 
      headless: true,
      // Явно указываем путь к браузеру, который мы установили в Dockerfile
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
      // Эти флаги КРИТИЧЕСКИ ВАЖНЫ для работы внутри Docker-контейнера
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // ==========================================
    // 3. БЛОК АВТОРИЗАЦИИ (ЛОГИН)
    // ==========================================
    await progress.update('🔐 Прохожу авторизацию...');
    await page.goto('https://dev.myndp.kz/authorization'); 
    
    await page.click('text=Пароль');

    // Вводим логин и пароль
    // Ищем поле прямо по тексту внутри него
    await page.waitForSelector('input[placeholder="Введите свой логин"]', { state: 'visible' });
    await page.fill('input[placeholder="Введите свой логин"]', process.env.MYNDP_LOGIN);
    await page.fill('input[placeholder="*****"]', process.env.MYNDP_PASSWORD);
    await page.click('button:has-text("Войти")');
    
    // Ждем, пока пройдет загрузка и нас пустит внутрь (на дашборд)
    // Символы ** означают "любой путь, содержащий dashboard"
    await page.waitForURL('**/dashboard**', { timeout: 15000 }); 

    // ==========================================
    // 4. БЛОК ОФОРМЛЕНИЯ ОГПО
    // ==========================================
    await progress.update('🌐 Открываю форму ОГПО...');

    await page.goto('https://dev.myndp.kz/policies/ogpo/buy');

    await progress.update(`✍️ Ввожу данные: ИИН ${iin}, Авто ${carNumber}...`);
    
    // Вводим данные
    await page.fill('input[name="iin"]', iin); 
    await page.fill('input[name="carNumber"]', carNumber);
    
    // Кликаем "Рассчитать"
    await page.click('button:has-text("Рассчитать")');

    // Ждем цену. ИСПРАВЛЕН СЕЛЕКТОР (точки вместо пробелов)
    await progress.update('⏳ Жду расчет стоимости от сервера...');
    await page.waitForSelector('.flex.flex-col.gap-1', { timeout: 15000 });

    // Делаем промежуточный скриншот
    const buffer = await page.screenshot({ fullPage: true });
    await ctx.replyWithPhoto({ source: buffer }, { caption: '📸 Расчет прошел успешно, оформляю...' });

    await progress.update('📝 Выпускаю полис...');
    await page.click('button:has-text("Выпустить полис")');

    // Ждем сообщение об успехе. ИСПРАВЛЕН СЕЛЕКТОР
    await page.waitForSelector('.success-message', { timeout: 15000 });

    // Финал: Делаем финальный скриншот
    const finalBuffer = await page.screenshot({ fullPage: true });
    await progress.done('✅ Полис успешно выписан через WEB!');
    await ctx.replyWithPhoto({ source: finalBuffer }, { caption: `🎉 Полис ОГПО для ${carNumber} готов!` });

  } catch (err) {
    console.error('[handleWebOgpo] Error:', err);
    
    // Если упали, делаем скриншот ошибки
    if (browser) {
      try {
        const pages = browser.contexts()[0].pages();
        if (pages.length > 0) {
          const errBuffer = await pages[0].screenshot();
          await ctx.replyWithPhoto({ source: errBuffer }, { caption: '❌ Ошибка на странице (скриншот)' });
        }
      } catch (e) {}
    }
    
    if (progress) await progress.fail(`Ошибка: ${err.message}`);
    else await ctx.reply(`❌ Произошла ошибка: ${err.message}`);
  } finally {
    if (browser) {
      await browser.close(); 
    }
  }
}