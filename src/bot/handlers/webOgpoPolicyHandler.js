'use strict';

const { Scenes} = require('telegraf');
const { chromium } = require('playwright');
// Если путь до progress другой, поправь его (обычно это '../progress')
const { Progress } = require('../progress');
const fs = require('fs-extra');
const path = require('path');
const os = require('os'); 
const { text, file, drop } = require('pdfkit');

async function downloadTelegramFile(ctx) {
  let fileId;
  if (ctx.message?.photo) {
    fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  } else if (ctx.message?.document) {
    fileId = ctx.message.document.file_id;
  } else {
    return null;
  }

  const fileLink = await ctx.telegram.getFileLink(fileId);
  const ext = path.extname(fileLink.pathname) || '.jpg';
  const tempFilePath = path.join(os.tmpdir(), `document_${Date.now()}${ext}`);

  const response = await fetch(fileLink);
  const buffer = await response.arrayBuffer();
  await fs.writeFile(tempFilePath, Buffer.from(buffer));

  return tempFilePath;
}

const ogpoWizard = new Scenes.WizardScene(
  'OGPO_SCENE',

  // Шаг 1: Инициализация и запрос паспорта
  async (ctx) => {
    await ctx.reply('Начинаем оформление ОГПО 🌐\n\n1️⃣ Пожалуйста, отправьте фото или документ **ПАСПОРТА**.', { parse_mode: 'Markdown' });
    ctx.scene.session.files = {};
    return ctx.wizard.next();
  },

  // Шаг 2: Получаем паспорт, просим права
  async (ctx) => {
    const filePath = await downloadTelegramFile(ctx);
    if (!filePath) return ctx.reply('❌ Это не файл! Пожалуйста, отправьте картинку или PDF паспорта.');

    ctx.scene.session.files.passport = filePath;
    await ctx.reply('✅ Паспорт сохранен!\n\n2️⃣ Теперь отправьте **ВОДИТЕЛЬСКОЕ УДОСТОВЕРЕНИЕ**.', { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  // Шаг 3: Получаем права, просим лицевую сторону техпаспорта
  async (ctx) => {
    const filePath = await downloadTelegramFile(ctx);
    if (!filePath) return ctx.reply('❌ Ошибка. Отправьте водительское удостоверение.');
    
    ctx.scene.session.files.driverLicense = filePath;
    await ctx.reply('✅ Права получены!\n\n3️⃣ Отправьте **ЛИЦЕВУЮ СТОРОНУ ТЕХПАСПОРТА**.', { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  // Шаг 4: Получаем лицевую техпаспорта, просим заднюю
  async (ctx) => {
    const filePath = await downloadTelegramFile(ctx);
    if (!filePath) return ctx.reply('❌ Ошибка. Отправьте лицевую сторону техпаспорта.');
    
    ctx.scene.session.files.techFront = filePath;
    await ctx.reply('✅ Лицевая сторона сохранена!\n\n4️⃣ Отправьте **ОБРАТНУЮ СТОРОНУ ТЕХПАСПОРТА**.', { parse_mode: 'Markdown' });
    return ctx.wizard.next();
  },

  // Шаг 5: Получаем заднюю сторону и запускаем бота
  async (ctx) => {
    const filePath = await downloadTelegramFile(ctx);
    if (!filePath) return ctx.reply('❌ Ошибка. Отправьте обратную сторону техпаспорта.');
    
    ctx.scene.session.files.techBack = filePath;
    await ctx.reply('✅ Все 4 документа успешно собраны! Запуск бота... 🤖');
    
    // Вызываем нашу главную функцию и передаем ей собранные файлы!
    await handleWebOgpoPolicy(ctx, ctx.scene.session.files);
    
    // Выходим из сцены, чтобы бот снова реагировал на обычные команды
    return ctx.scene.leave();
  }
);


// Теперь filePath может быть массивом: [лицевая, оборотная]
async function uploadDocumentAndConfirm(page, progress, filePaths, docName, buttonIndex = 0) {
    const files = Array.isArray(filePaths) ? filePaths : [filePaths];
    await progress.update(`📄 Загружаю ${docName} в CRM...`);

    // 1. Кликаем "Приложить документ" на текущей большой форме
    await page.locator('text="Приложить документ"').nth(buttonIndex).click({ force: true });

    // 2. Ищем самое верхнее всплывающее окно (маленькую модалку загрузки файлов)
    const uploadModal = page.getByRole('dialog', { name: 'Просим уточнить ваши данные' }).last();
    await uploadModal.waitFor({ state: 'visible' });

    // 3. Загружаем каждый файл
    for (let i = 0; i < files.length; i++) {
        if (!files[i]) continue; 
        
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            // Всегда кликаем по первой доступной кнопке, так как заполненные слоты меняют текст
            uploadModal.locator('text="Приложить документ"').first().click({ force: true })
        ]);
        
        await fileChooser.setFiles(files[i]);
        
        // Ждем, пока имя файла появится в интерфейсе
        const fileName = path.basename(files[i]);
        await uploadModal.locator(`text="${fileName}"`).waitFor({ state: 'visible', timeout: 15000 });

        await page.waitForTimeout(1000);
    }

    // 4. Жмем Далее внутри маленькой модалки
    await uploadModal.locator('button', { hasText: 'Далее' }).click();
    await progress.update(`⏳ Ждём распознавания: ${docName}...`);

    // Дополнительная защита: ждем исчезновения загрузки браузера, если есть
    try {
        await page.locator('text="Загрузка..."').waitFor({ state: 'hidden', timeout: 10000 });
    } catch (e) {}

    // 5. Ловим результат распознавания (Успех ИЛИ Ошибка)
    const errorModal = page.getByRole('dialog', { name: 'Не удалось распознать данные документа' });
    const successModal = page.locator('[role="dialog"][aria-label*="Внимание! Мы автоматически заполнили"]');

    try {
        // Ждем до 15 секунд любое из трех событий: Ошибка, Успех, или просто закрытие окна загрузки
        await Promise.race([
            errorModal.waitFor({ state: 'visible', timeout: 15000 }),
            successModal.waitFor({ state: 'visible', timeout: 15000 }),
            uploadModal.waitFor({ state: 'hidden', timeout: 15000 })
        ]);
    } catch (e) {}

    // 6. Проверяем, вылезло ли окно ошибки OCR
    if (await errorModal.isVisible().catch(() => false)) {
        await progress.update(`⚠️ Не удалось распознать ${docName}, перехожу в ручной ввод...`);
        // Нажимаем оранжевую кнопку, чтобы закрыть окно ошибки
        await errorModal.locator('button', { hasText: 'Ввести вручную' }).click();
        await errorModal.waitFor({ state: 'hidden' });
        await page.waitForTimeout(500);
    } 
    // 7. Если ошибки нет, проверяем, есть ли окно подтверждения успеха
    else if (await successModal.isVisible().catch(() => false)) {
        await successModal.locator('button', { hasText: 'Подтвердить' }).click();
        await successModal.waitFor({ state: 'hidden' });
        await page.waitForTimeout(500);
    }

    // 8. Обработка окна успешного OCR
    try {
        const successModal = page.locator('[role="dialog"][aria-label*="Внимание! Мы автоматически заполнили"]');
        await successModal.waitFor({ state: 'visible', timeout: 45000 });
        
        await successModal.locator('button', { hasText: 'Подтвердить' }).click();
        await successModal.waitFor({ state: 'hidden' });
        await page.waitForTimeout(1000);
    } catch (err) {
        console.warn(`[OCR] Окно подтверждения не появилось для ${docName} за 45 секунд.`);
        await page.waitForTimeout(1000);
    }
}


// Обработчик полиса огпо
async function handleWebOgpoPolicy(ctx, files) {
  let progress = null;
  let browser = null;

  const downloadedFilePassport = files.passport;
  let downloadedFileDriverLicense = files.driverLicense;
  let downloadedFileTechPassportFront = files.techFront;
  let downloadedFileTechPassportBack = files.techBack;

try {
    progress = await new Progress(ctx, '⚙️ Инициализирую браузер для оформления...').start();

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

    // Переходим к форме ОГПО
    await page.click('text="Далее"');
    await page.click('text="Добавить застрахованного"');

    // Пауза нужна, чтобы React/Vue успели подгрузить onClick-события на кнопку.
    await page.waitForTimeout(1000); 

    // Паспорт
    await uploadDocumentAndConfirm(page, progress, [downloadedFilePassport], 'Паспорт', 0);

    // Временный буффер для скриншотов
    const passport_buffer = await page.screenshot({fullPage: true});
    await ctx.replyWithPhoto({source: passport_buffer}, { caption: '📸 Паспорт распознан' });

    // Водительское удостоверение
    await uploadDocumentAndConfirm(page, progress, [downloadedFileDriverLicense], 'Водительское удостоверение', 0);

    await page.waitForTimeout(2000);

    const dl_buffer = await page.screenshot({fullPage: true});
    await ctx.replyWithPhoto({source: dl_buffer}, { caption: '📸 Водительское удостоверение распознано' })

    const insuredModal = page.locator('[role="dialog"][aria-label="Добавить застрахованного"]')

    const dobInput = insuredModal.locator('input[placeholder="дд.мм.гггг"]').first();
    if (await dobInput.count() > 0 && await dobInput.isVisible()) {
        await dobInput.click();
        await dobInput.pressSequentially('22041978', { delay: 50 });
        await dobInput.press('Escape'); // Закрываем календарь
        await page.waitForTimeout(300);
    }

    const allInputs = await insuredModal.locator('input').all();
    for (const input of allInputs) {
        const isEditable = await input.isEditable().catch(() => false);
        if (isEditable) {
            const val = await input.inputValue();
            // Если находим что-то кроме стандартной латиницы, кириллицы, цифр, пробелов и дефисов
            if (val && /[^a-zA-Zа-яА-ЯёЁ0-9\s.-]/.test(val)) {
                // Транслитерируем популярные тюркские символы в стандартную латиницу
                let cleanVal = val
                    .replace(/ç/gi, 'c')
                    .replace(/ş/gi, 's')
                    .replace(/ğ/gi, 'g')
                    .replace(/ı/gi, 'i')
                    .replace(/ö/gi, 'o')
                    .replace(/ü/gi, 'u')
                    .replace(/ň/gi, 'n');
                    
                // Жестко вырезаем любой другой неформатный символ, если он остался
                cleanVal = cleanVal.replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s.-]/g, '');
                
                await input.fill(cleanVal);
                // Даем React миллисекунды, чтобы перерисовать компонент и снять ошибку валидации
                await page.waitForTimeout(300);
            }
        }
    }

    await page.waitForTimeout(2000);

    const confirmInsuredBtn = insuredModal.locator('button:has-text("Подтвердить"), button:has-text("Передать в ЕСБД")').last();
    await confirmInsuredBtn.scrollIntoViewIfNeeded();
    await confirmInsuredBtn.click();

    await insuredModal.waitFor({ state: 'hidden', timeout: 15000 });

    await page.waitForTimeout(1000);

    // 2. Ждем возврата на главную страницу
    // Маркером главной страницы является кнопка "Добавить ТС"
    const addCarBtn = page.locator('text="Добавить ТС"').last();
    await addCarBtn.waitFor({ state: 'visible', timeout: 15000 });
    
    await page.waitForTimeout(1000); // Даем интерфейсу плавно отрисоваться

    // 3. Открываем форму транспортного средства
    await addCarBtn.click({ force: true });

    // 4. Ждем, пока откроется форма ТС
    // Маркером открытия является поле "Гос номер"
    await page.waitForSelector('text="Гос номер"', { state: 'visible', timeout: 15000 });

    // Техпаспорт (обе стороны)
    await uploadDocumentAndConfirm(page, progress, [downloadedFileTechPassportFront, downloadedFileTechPassportBack], 'Тех. паспорт (обе стороны)', 0);

    await page.waitForTimeout(2000);

    // Ищем большую форму ТС 
    const tsModal = page.locator('[role="dialog"][aria-label="Просим уточнить ваши данные"]').first();
    
    // Проходимся по полям ТС и срезаем случайные пробелы от OCR (особенно в VIN и Госномере)
    const tsInputs = await tsModal.locator('input').all();
    for (const input of tsInputs) {
        const isEditable = await input.isEditable().catch(() => false);
        if (isEditable) {
            const val = await input.inputValue();
            if (val && /\s/.test(val)) {
                await input.fill(val.replace(/\s+/g, ''));
                await page.waitForTimeout(300); // Даем React обновить стейт
            }
        }
    }

    const yearInput = tsModal.locator('input[placeholder="гггг"]').first();
    if (await yearInput.count() > 0 && await yearInput.isVisible()) {
        const currentYear = await yearInput.inputValue();
        if (!currentYear || currentYear.trim() === '') {
            await yearInput.click();
            await yearInput.fill('2011');
            await page.waitForTimeout(300);
        }
    }

    // 2. Тип ТС
    const typeDropdown = tsModal.locator('text="Выберите тип"').first();
    if (await typeDropdown.count() > 0 && await typeDropdown.isVisible()) {
        await typeDropdown.click();
        await page.waitForTimeout(500); 
        await page.locator('text="Грузовые"').first().click();
        await page.waitForTimeout(300);
    }

    // 3. Дата выдачи
    const certificateDateIssue = tsModal.locator('input[placeholder="дд.мм.гггг"]').first();
    if (await certificateDateIssue.count() > 0 && await certificateDateIssue.isVisible()) {
        await certificateDateIssue.click();
        await certificateDateIssue.pressSequentially('19032026', { delay: 50 });
        await certificateDateIssue.press('Escape');
        await page.waitForTimeout(500);
    }

    // 📸 4. ДЕЛАЕМ СКРИНШОТ ФОРМЫ (после того как скрипт всё заполнил, но до нажатия Подтвердить)
    const tech_buffer = await page.screenshot({ fullPage: true });
    await ctx.replyWithPhoto({ source: tech_buffer }, { caption: '📸 Обе стороны тех. паспорта распознаны, поля исправлены и заполнены' });

    // 5. Ищем кнопку подтверждения внутри формы ТС и кликаем
    const confirmTsBtn = tsModal.locator('button', { hasText: 'Подтвердить' }).last();
    await confirmTsBtn.scrollIntoViewIfNeeded();
    await confirmTsBtn.click();

    // 6. Ждем, пока форма ТС закроется
    await tsModal.waitFor({ state: 'hidden', timeout: 15000 });
    await page.waitForTimeout(3000);

    // 7. УМНОЕ ОЖИДАНИЕ ОТВЕТА СЕРВЕРА (ждём либо успешный переход, либо ошибку 503)
    try {
        await Promise.race([
            page.locator('text="Тип уведомления"').waitFor({ state: 'visible', timeout: 15000 }),
            page.getByText(/503: Service Unavailable/i).waitFor({ state: 'visible', timeout: 15000 })
        ]);
    } catch (e) {} // Игнорируем ошибки таймаута гонки

    // 8. Проверяем, вылезла ли ошибка ЕСБД в итоге
    const esbdErrorBanner = page.getByText(/503: Service Unavailable/i);
    if (await esbdErrorBanner.isVisible().catch(() => false)) {
        const errBuffer = await page.screenshot({ fullPage: true });
        await progress.fail('Ошибка валидации ЕСБД!');
        await ctx.replyWithPhoto({ source: errBuffer }, { caption: '❌ (Ошибка 503). Оформление прервано.' });
        return; 
    }

    // Финальный раздел 
    await page.click('text="Тип уведомления"');
    await page.waitForTimeout(500);
    await page.click('text=Email + SMS');

    const phoneInput = page.locator('input[placeholder="Введите номер телефона"]');
    await phoneInput.click();
    await phoneInput.fill('+77001234567');

    const emailInput = page.locator('input[placeholder="Введите почту"]');
    await emailInput.click();
    await emailInput.fill('abdula.k@gmail.com');

    const phone_email_buffer = await page.screenshot({fullPage: true});
    await ctx.replyWithPhoto({source: phone_email_buffer}, { caption: '📸 Успешно заполнены поля - телефон и почта' })

    await page.locator('button', { hasText: 'Передать в ЕСБД' }).click();

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
    await ctx.replyWithPhoto({ source: finalBuffer }, { caption: `🎉 Полис ОГПО готов!` });

  } catch (err) {
    console.error('[handleWebOgpoPolicy] Error:', err);
    
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
    if (browser) await browser.close();
    // Очищаем файлы
    if (downloadedFilePassport) await fs.remove(downloadedFilePassport).catch(() => {});
    if (downloadedFileDriverLicense) await fs.remove(downloadedFileDriverLicense).catch(() => {});
    if (downloadedFileTechPassportFront) await fs.remove(downloadedFileTechPassportFront).catch(() => {});
    if (downloadedFileTechPassportBack) await fs.remove(downloadedFileTechPassportBack).catch(() => {});
  }
}

module.exports = { ogpoWizard, downloadTelegramFile, uploadDocumentAndConfirm };