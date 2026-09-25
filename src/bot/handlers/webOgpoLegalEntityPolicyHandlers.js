'use strict';

const { Scenes } = require('telegraf');
const { chromium } = require('playwright');
const { Progress } = require('../progress');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { downloadTelegramFile, uploadDocumentAndConfirm } = require('./webOgpoPolicyHandler');

// ---------------------------------------------------------
// Сцена Telegram (Только 2 документа: Техпаспорт Лицевая + Оборот)
// ---------------------------------------------------------
const ogpoLegalWizard = new Scenes.WizardScene(
    'OGPO_LEGAL_SCENE',

    // Шаг 1: Инициализация и запрос СРАЗУ ДВУХ документов
    async (ctx) => {
        await ctx.reply(
            'Начинаем оформление ОГПО для юридических лиц \n\n' +
            'Пожалуйста, отправьте **СРАЗУ 2 ФАЙЛА** техпаспорта (лицевую и обратную сторону).\n\n' +
            '_ Подсказка: Выделите оба файла и отправьте их одним сообщением (альбомом)._', 
            { parse_mode: 'Markdown' }
        );
        ctx.scene.session.files = {};
        return ctx.wizard.next();
    },

    // Шаг 2: Умный перехватчик альбома (ловит оба файла по очереди)
    async (ctx) => {
        const filePath = await downloadTelegramFile(ctx);
        if (!filePath) return ctx.reply('Пожалуйста, отправьте картинку или PDF.');

        // Проверяем, есть ли уже лицевая сторона. Если нет — записываем.
        if (!ctx.scene.session.files.techFront) {
            ctx.scene.session.files.techFront = filePath;
            
            // Мы завершаем обработку первого файла (return), но НЕ переключаем шаг (нет ctx.wizard.next)!
            // Бот остается на этом же шаге и ждет долю секунды, пока прилетит второй файл из альбома.
            return; 
        } 
        
        // Если лицевая уже есть в памяти, значит это прилетел второй файл
        if (!ctx.scene.session.files.techBack) {
            ctx.scene.session.files.techBack = filePath;
            
            await ctx.reply('Оба документа успешно получены! Запускаю браузер... ');
            
            // Вызываем Playwright
            await handleWebOgpoLegalPolicy(ctx, ctx.scene.session.files);
            
            // Завершаем сцену
            return ctx.scene.leave();
        }
    }
);

// ---------------------------------------------------------
// Главная функция автоматизации Юр. Лица
// ---------------------------------------------------------
async function handleWebOgpoLegalPolicy(ctx, files) {
    let progress = null;
    let browser = null;

    let downloadedFileTechPassportFront = files.techFront;
    let downloadedFileTechPassportBack = files.techBack;

    try {
        progress = await new Progress(ctx, 'Инициализирую браузер для оформления ЮР. ЛИЦА...').start();

        browser = await chromium.launch({ 
            headless: true,
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const context = await browser.newContext();
        const page = await context.newPage();

        // 1. АВТОРИЗАЦИЯ
        await progress.update('Прохожу авторизацию...');
        await page.goto('https://dev.myndp.kz/authorization'); 
        await page.click('text=Пароль');
        await page.waitForSelector('input[placeholder="Введите свой логин"]', { state: 'visible' });
        await page.fill('input[placeholder="Введите свой логин"]', process.env.MYNDP_LOGIN);
        await page.fill('input[placeholder="*****"]', process.env.MYNDP_PASSWORD);
        await page.click('button:has-text("Войти")');
        await page.waitForURL('**/dashboard**', { timeout: 15000 }); 

        // 2. ОФОРМЛЕНИЕ ОГПО
        await progress.update('Открываю форму ОГПО...');
        await page.goto('https://dev.myndp.kz/policies/ogpo/buy');
        await page.waitForTimeout(2000); 

        // Выбираем Юр лицо на главной странице
        await progress.update('Переключаю на Юридическое лицо...');

        await page.locator('button', { hasText: 'Далее' }).first().click({ force: true });
        await page.waitForTimeout(1000); 
        await page.getByText('Добавить застрахованного').first().click({ force: true });
        await page.waitForTimeout(1500); 

        // "Юридическое лицо"
        await page.getByText('Юр. лицо', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(1000); 

        // 3. РАБОТА С ФОРМОЙ ЮР. ЛИЦА
        await progress.update('Заполняю данные юридического лица...');
        const insuredModal = page.locator('[role="dialog"][aria-label="Добавить застрахованного"]').first();
        
        // Переключаем верхний таб внутри модалки на "Юр. лицо"
        await insuredModal.getByText('Юр. лицо', { exact: true }).click({ force: true });
        await page.waitForTimeout(1000);

        // Полное наименование
        await insuredModal.locator('input[placeholder="Введите название юр. лица"]').fill('АШБА Р. А.');
        await page.waitForTimeout(300);

        // Страна регистрации (плейсхолдер "Выберите гражданство")
        await insuredModal.locator('text="Выберите гражданство"').first().click({ force: true });
        await page.waitForTimeout(500);
        await page.getByText('Китай', { exact: true }).first().click({ force: true });
        
        // Сектор экономики
        await insuredModal.locator('text="Выберите сектор экономики"').first().click({ force: true });
        await page.waitForTimeout(500);
        await page.getByText('1 — Центральное Правительство', { exact: true }).first().click({ force: true });

        // ОКЭД
        await insuredModal.locator('text="Выберите ОКЭД"').first().click({ force: true });
        await page.waitForTimeout(500);
        await page.getByText('0112 — Выращивание риса', { exact: true }).first().click({ force: true });

        // Адрес
        await insuredModal.locator('input[placeholder="Введите адрес"]').fill('г. Алматы, ул. Тестовая 123');

        // НОМЕР СЧЕТА И БИК ПРОПУСКАЕМ

        const insured_buffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: insured_buffer }, { caption: 'Данные Юр. лица заполнены (Счет и БИК пропущены)' });

        const confirmInsuredBtn = insuredModal.locator('button', { hasText: 'Подтвердить' }).last();
        await confirmInsuredBtn.scrollIntoViewIfNeeded();
        await confirmInsuredBtn.click({ force: true });
        await insuredModal.waitFor({ state: 'hidden', timeout: 15000 });

        // 4. ТРАНСПОРТНОЕ СРЕДСТВО (Остается без изменений)
        await progress.update('Добавляю транспортное средство...');
        const addCarBtn = page.locator('text="Добавить ТС"').last();
        await addCarBtn.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForTimeout(1000); 
        await addCarBtn.click({ force: true });

        await page.waitForSelector('text="Гос номер"', { state: 'visible', timeout: 15000 });

        // Загрузка техпаспорта
        await uploadDocumentAndConfirm(page, progress, [downloadedFileTechPassportFront, downloadedFileTechPassportBack], 'Тех. паспорт (обе стороны)', 0);
        await page.waitForTimeout(2000);

        const tsModal = page.locator('[role="dialog"][aria-label="Просим уточнить ваши данные"]').first();
        const tsInputs = await tsModal.locator('input').all();
        for (const input of tsInputs) {
            const isEditable = await input.isEditable().catch(() => false);
            if (isEditable) {
                const val = await input.inputValue();
                if (val && /\s/.test(val)) {
                    await input.fill(val.replace(/\s+/g, ''));
                    await page.waitForTimeout(300);
                }
            }
        }
        
        // 1. Год выпуска
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

        const confirmTsBtn = tsModal.locator('button', { hasText: 'Подтвердить' }).last();
        await confirmTsBtn.scrollIntoViewIfNeeded();
        await confirmTsBtn.click();
        await tsModal.waitFor({ state: 'hidden', timeout: 15000 });
        await page.waitForTimeout(3000);

        // 5. ПРОВЕРКА ЕСБД И ВЫПИСКА
        try {
            await Promise.race([
                page.locator('text="Тип уведомления"').waitFor({ state: 'visible', timeout: 15000 }),
                page.getByText(/503: Service Unavailable/i).waitFor({ state: 'visible', timeout: 15000 })
            ]);
        } catch (e) {} 

        const esbdErrorBanner = page.getByText(/503: Service Unavailable/i);
        if (await esbdErrorBanner.isVisible().catch(() => false)) {
            const errBuffer = await page.screenshot({ fullPage: true });
            await progress.fail('Ошибка валидации ЕСБД!');
            await ctx.replyWithPhoto({ source: errBuffer }, { caption: '(Ошибка 503). Оформление прервано.' });
            return; 
        }

        // Финальный раздел
        await page.click('text="Тип уведомления"');
        await page.waitForTimeout(500);
        await page.click('text=Email + SMS');

        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        const phoneInput = page.locator('input[placeholder="Введите номер телефона"]');
        await phoneInput.click({ force: true });
        await phoneInput.fill('+77001234567');

        const emailInput = page.locator('input[placeholder="Введите почту"]');
        await emailInput.click();
        await emailInput.fill('abdula.k@gmail.com');

        await page.locator('button', { hasText: 'Передать в ЕСБД' }).click();

        await progress.update('Ожидаю реакцию системы...');
        await page.waitForTimeout(3000);

        const buffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: buffer }, { caption: 'Статус после отправки в ЕСБД...' });

        await progress.update('Проверяю выпуск полиса...');
        
        // Умное ожидание: бот ждет ЛИБО кнопку "Выпустить", ЛИБО сразу экран успеха
        const issueBtn = page.locator('button', { hasText: 'Выпустить полис' });
        const successMsg = page.getByText('Ваш полис успешно выписан');

        try {
            await Promise.race([
                issueBtn.waitFor({ state: 'visible', timeout: 15000 }),
                successMsg.waitFor({ state: 'visible', timeout: 15000 })
            ]);
        } catch (e) {} // Игнорируем ошибку гонки, дальше проверим по факту

        // Если система всё-таки просит нажать кнопку вручную - жмем
        if (await issueBtn.isVisible().catch(() => false)) {
            await issueBtn.click({ force: true });
        }

        // Финальное ожидание экрана успеха (на случай, если мы только что нажали кнопку)
        await successMsg.waitFor({ state: 'visible', timeout: 20000 });

        const finalBuffer = await page.screenshot({ fullPage: true });
        await progress.done('Полис успешно выписан через WEB!');
        await ctx.replyWithPhoto({ source: finalBuffer }, { caption: `Полис ОГПО (Юр. Лицо) готов!` });

    } catch (err) {
        console.error('[handleWebOgpoLegalPolicy] Error:', err);
        if (browser) {
            try {
                const pages = browser.contexts()[0].pages();
                if (pages.length > 0) {
                    await pages[0].setViewportSize({ width: 1280, height: 2000 });
                    const errBuffer = await pages[0].screenshot({ fullPage: true });
                    await ctx.replyWithPhoto({ source: errBuffer }, { caption: `Ошибка:\n${err.message}` });
                }
            } catch (e) {}
        }
        if (progress) await progress.fail(`Ошибка: ${err.message}`);
    } finally {
        if (browser) await browser.close();
        if (downloadedFileTechPassportFront) await fs.remove(downloadedFileTechPassportFront).catch(() => {});
        if (downloadedFileTechPassportBack) await fs.remove(downloadedFileTechPassportBack).catch(() => {});
    }
}

module.exports = { ogpoLegalWizard, downloadTelegramFile, uploadDocumentAndConfirm };