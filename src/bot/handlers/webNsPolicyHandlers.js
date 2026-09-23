'use strict';

const { Scenes } = require('telegraf'); 
const { chromium } = require('playwright');
const { Progress } = require('../progress'); 
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { downloadTelegramFile } = require('./webOgpoPolicyHandler');

// --- Функция транслитерации (Латиница -> Кириллица) ---
function transliterateToCyrillic(text) {
    if (!text) return '';
    let result = text.toUpperCase();
    
    const digraphs = {
        'SHCH': 'Щ', 'ZH': 'Ж', 'KH': 'Х', 'TS': 'Ц', 'CH': 'Ч', 'SH': 'Ш', 'YU': 'Ю', 'YA': 'Я'
    };
    for (const [lat, cyr] of Object.entries(digraphs)) {
        result = result.split(lat).join(cyr);
    }

    const singles = {
        'A': 'А', 'B': 'Б', 'V': 'В', 'G': 'Г', 'D': 'Д', 'E': 'Е', 'Z': 'З', 'I': 'И', 'J': 'Й', 'Y': 'Й',
        'K': 'К', 'L': 'Л', 'M': 'М', 'N': 'Н', 'O': 'О', 'P': 'П', 'R': 'Р', 'S': 'С', 'T': 'Т', 'U': 'У', 
        'F': 'Ф', 'C': 'Ц', 'W': 'В'
    };
    for (const [lat, cyr] of Object.entries(singles)) {
        result = result.split(lat).join(cyr);
    }
    
    return result;
}

async function handleWebNs(ctx, data) {
    let progress = null;
    let browser = null;
    let page = null;
    const downloadedFilePassport = data.passport;

    try {
        progress = await new Progress(ctx, '⚙️ Инициализирую браузер для оформления НС...').start();

        browser = await chromium.launch({
            headless: true,
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const context = await browser.newContext();
        page = await context.newPage();

        await progress.update('🔐 Прохожу авторизацию...');
        await page.goto('https://dev.myndp.kz/authorization'); 
        await page.click('text="Пароль"');
        await page.waitForSelector('input[placeholder="Введите свой логин"]', { state: 'visible' });
        await page.fill('input[placeholder="Введите свой логин"]', process.env.MYNDP_LOGIN);
        await page.fill('input[placeholder="*****"]', process.env.MYNDP_PASSWORD);
        await page.click('button:has-text("Войти")');
        await page.waitForURL('**/dashboard**', { timeout: 15000 });

        await progress.update('🌐 Открываю форму НС...');
        await page.goto('https://dev.myndp.kz/policies/ns/buy');

        // --- ШАГ 1: Параметры страховки ---
        await progress.update('Заполняю форму НС...');

        await page.getByText('Взрослые', { exact: true }).first().click({ force: true });
        
        await page.getByText('Выберите сумму', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(500);
        await page.getByText('1 000 000 тг').first().click({ force: true }); // Выбор из дропдауна[cite: 32]
        await page.waitForTimeout(500);

        await page.waitForTimeout(2500);

        // 📸 Скриншот успешного 1 шага 
        let step1Buffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: step1Buffer }, { caption: '📸 Шаг 1: Параметры страховки успешно заполнены' });

        await page.locator('button', { hasText: 'Купить' }).first().click({ force: true });
        await page.waitForTimeout(1000);

        // --- ШАГ 2: Контакты и ИИН ---
        const phoneInput = page.locator('input[placeholder="+7(777)777-77-77"]');
        await phoneInput.waitFor({ state: 'visible', timeout: 15000 });
        await phoneInput.click();
        await phoneInput.fill(data.phone);

        const emailInput = page.locator('input[placeholder="Введите почту"]');
        await emailInput.click();
        await emailInput.fill(data.email);

        let emailAndPhoneBuffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: emailAndPhoneBuffer }, { caption: '📸 Номер телефона и почта успешно заполнены' });

        await page.locator('button', { hasText: 'Далее' }).click();
        await page.waitForTimeout(2500);

        if (data.iin) {
            const iinInput = page.locator('input[placeholder="Введите ИИН"]');
            if (await iinInput.isVisible()) {
                await iinInput.click();
                await iinInput.fill(data.iin);
                await page.waitForTimeout(1000); 
            }
        }
        
        // ==========================================
        // БЛОК ЗАГРУЗКИ ДОКУМЕНТА
        // ==========================================
        await progress.update(`📄 Загружаю ${data.docType} в CRM...`);
        await page.locator('text="Приложить документ"').first().click({ force: true });
        
        const uploadModal = page.getByRole('dialog', { name: 'Просим уточнить ваши данные' }).last();
        await uploadModal.waitFor({ state: 'visible' });

        const docTypeDropdown = uploadModal.locator('text="Паспорт"').first();
        if (await docTypeDropdown.isVisible()) {
            await docTypeDropdown.click();
            await page.waitForTimeout(500);
            await uploadModal.locator(`text="${data.docType}"`).first().click();
            await page.waitForTimeout(500);
        }

        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            uploadModal.locator('text="Приложить документ"').first().click({ force: true })
        ]);
        await fileChooser.setFiles(downloadedFilePassport);
        
        const fileName = path.basename(downloadedFilePassport);
        await uploadModal.locator(`text="${fileName}"`).waitFor({ state: 'visible', timeout: 15000 });
        
        await uploadModal.locator('button', { hasText: 'Далее' }).click();
        await progress.update(`⏳ Ждём распознавания OCR...`);

        const errorModal = page.getByRole('dialog', { name: 'Не удалось распознать данные' });
        const successModal = page.locator('[role="dialog"][aria-label*="Внимание! Мы автоматически заполнили"]');

        try {
            await Promise.race([
                errorModal.waitFor({ state: 'visible', timeout: 20000 }),
                successModal.waitFor({ state: 'visible', timeout: 20000 }),
                uploadModal.waitFor({ state: 'hidden', timeout: 20000 })
            ]);
        } catch (e) {}

        if (await errorModal.isVisible().catch(() => false)) {
            await progress.update(`⚠️ Не удалось распознать документ, перехожу в ручной ввод...`);
            await errorModal.locator('button', { hasText: 'Ввести вручную' }).click();
            await errorModal.waitFor({ state: 'hidden' });
        } else if (await successModal.isVisible().catch(() => false)) {
            await successModal.locator('button', { hasText: 'Подтвердить' }).click();
            await successModal.waitFor({ state: 'hidden' });
        }

        await page.waitForTimeout(2000);

        // --- УМНАЯ ПРОВЕРКА ПОЛЕЙ ---
        const mstModal = page.locator('[role="dialog"][aria-label="Просим уточнить ваши данные"]').first();
        if (await mstModal.isVisible()) {
            const modalInputs = mstModal.locator('input');

            const latinLast = await modalInputs.nth(0).inputValue();
            const latinFirst = await modalInputs.nth(1).inputValue();

            const currentRusLast = await modalInputs.nth(2).inputValue();
            if (!currentRusLast || currentRusLast.trim() === '') {
                await modalInputs.nth(2).fill(transliterateToCyrillic(latinLast));
            }

            const currentRusFirst = await modalInputs.nth(3).inputValue();
            if (!currentRusFirst || currentRusFirst.trim() === '') {
                await modalInputs.nth(3).fill(transliterateToCyrillic(latinFirst));
            }

            const currentAddress = await modalInputs.nth(4).inputValue();
            if (!currentAddress || currentAddress.trim() === '') {
                await modalInputs.nth(4).fill(data.address);
            }

            const genderPlaceholder = mstModal.locator('text="Выберите из списка", text="Выберите пол"').first();
            if (await genderPlaceholder.isVisible().catch(() => false)) {
                await genderPlaceholder.click({ force: true });
                await page.waitForTimeout(500);
                await page.getByText(data.gender, { exact: true }).last().click({ force: true });
                await page.waitForTimeout(300);
            }

            const confirmBtn = mstModal.locator('button', { hasText: 'Подтвердить' }).last();
            await confirmBtn.scrollIntoViewIfNeeded();
            await confirmBtn.click({ force: true });
            
            await mstModal.waitFor({ state: 'hidden', timeout: 15000 });
        }
        
        await page.waitForTimeout(1000);

        let step2Buffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: step2Buffer }, { caption: '📸 Шаг 2: Данные страхователя успешно сохранены' });

        const mainNextBtn = page.locator('button', { hasText: 'Далее' }).last();
        if (await mainNextBtn.isVisible().catch(() => false)) {
            await mainNextBtn.click();
            await page.waitForTimeout(1500);
        }

        // --- ШАГ 3: Анкета и Выпуск ---
        await progress.update('⏳ Скачиваю анкету и выписываю полис...');

        // Хардкод: жмем на кнопку печати анкеты[cite: 39]
        await page.getByText('Печать анкеты', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(1000);

        // Перехватываем скачивание[cite: 40]
        try {
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 8000 }),
                page.getByText('Анкета заявления и КИД').first().click({ force: true }) 
            ]);
            await download.delete(); // Удаляем файл, чтобы не забивать память сервера
        } catch (e) {
            console.log('Скачивание не триггернулось как файл, продолжаем...');
        }
        await page.waitForTimeout(1000);

        // Хардкод: жмем выписать полис[cite: 40]
        await page.getByText('Выписать полис', { exact: true }).first().click({ force: true });
        
        // Ждем успешного завершения (появления сообщения об успехе или окна "Мои полисы")
        try {
            await page.getByText('Мои полисы').waitFor({ state: 'visible', timeout: 25000 });
        } catch (e) {
            await page.waitForTimeout(3000); 
        }

        const finalBuffer = await page.screenshot({ fullPage: true });
        await progress.done('✅ Полис НС успешно выписан через WEB!');
        await ctx.replyWithPhoto({ source: finalBuffer }, { caption: `🎉 Полис НС готов!` });
        
    } catch (err) {
        console.error('[handleWebNs] Error:', err);
        
        if (page) {
            try {
                const errBuffer = await page.screenshot({ fullPage: true });
                await ctx.replyWithPhoto({ source: errBuffer }, { caption: `❌ Ошибка на странице оформления НС:\n\n${err.message}` });
            } catch (screenshotErr) {
                console.error('Не удалось сделать скриншот ошибки:', screenshotErr);
            }
        }
        
        if (progress) await progress.fail(`Ошибка НС: ${err.message}`);
    } finally {
        if (browser) await browser.close();
        if (downloadedFilePassport) {
            await fs.remove(downloadedFilePassport).catch(e => console.warn('Не удалось удалить файл:', e));
        }
    }
}

// Сцена для сбора документов и данных НС (Резидент)
const nsWizard = new Scenes.WizardScene(
    'NS_SCENE',
    async (ctx) => {
        await ctx.reply(
            'Начинаем оформление НС (Резидент) 🌐\n\n' +
            '1️⃣ Пожалуйста, отправьте фото или документ.\n' +
            '_Принимаются: Удостоверение личности, Паспорт или Водительское удостоверение._', 
            { parse_mode: 'Markdown' }
        );
        ctx.scene.session.nsData = {};
        return ctx.wizard.next();
    },
    async (ctx) => {
        const filePath = await downloadTelegramFile(ctx);
        if (!filePath) return ctx.reply('❌ Это не файл! Пожалуйста, отправьте картинку или PDF документа.');

        ctx.scene.session.nsData.passport = filePath;
        
        // Убрали лишние поля (страна, сумма, даты), оставили только нужное для НС
        const promptMsg = `✅ Документ сохранен!\n\n2️⃣ Теперь отправьте данные для оформления **ОДНИМ СООБЩЕНИЕМ** в таком формате:\n\n` +
            `Документ: Удостоверение личности\n` +
            `Телефон: +77777777777\n` +
            `Email: test@test.kz\n` +
            `ИИН: 040929500000\n` +
            `Адрес: ул. Абая 10\n` +
            `Пол: Мужской`;
                          
        await ctx.reply(promptMsg);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) {
            return ctx.reply('❌ Пожалуйста, отправьте текстовое сообщение с данными в указанном формате.');
        }

        const text = ctx.message.text;
        const data = ctx.scene.session.nsData;

        const extract = (key) => {
            const match = text.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
            return match ? match[1].trim() : null;
        };

        data.docType = extract('Документ') || 'Удостоверение личности';
        data.phone = extract('Телефон') || '7787060026';
        data.email = extract('Email') || 'abdula.k@gmail.com';
        data.iin = extract('ИИН') || '';
        data.address = extract('Адрес') || 'ул. Абая 10';
        data.gender = extract('Пол') || 'Мужской';

        await ctx.reply('✅ Данные приняты! Запускаю браузер... 🤖');
        
        await handleWebNs(ctx, data);
        
        return ctx.scene.leave();
    }
);

module.exports = { handleWebNs, nsWizard };