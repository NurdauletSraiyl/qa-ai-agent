'use strict';

const { Scenes } = require('telegraf'); 
const { chromium } = require('playwright');
const { Progress } = require('../progress'); 
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { text, file } = require('pdfkit');

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

// Обработчик полиса МСТ (Резидент + Динамические данные)
async function handleWebMst(ctx, data) {
    let progress = null;
    let browser = null;
    let page = null; // Вынесли page наверх, чтобы иметь к ней доступ в блоке catch
    const downloadedFilePassport = data.passport;

    try {
        progress = await new Progress(ctx, '⚙️ Инициализирую браузер для оформления МСТ...').start();

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

        await progress.update('🌐 Открываю форму МСТ...');
        await page.goto('https://dev.myndp.kz/policies/mst/buy');

        // --- ШАГ 1: Динамические параметры страховки ---
        await progress.update('Заполняю форму МСТ...');

        await page.getByText('Выберите страны', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(500); // Ждем раскрытия списка
        
        await page.getByText(data.country).first().click({ force: true });
        await page.waitForTimeout(1000);

        // 2. ВЫБОР СУММЫ
        // После выбора страны текст-заглушка меняется на "Выберите сумму"
        await page.getByText('Выберите сумму', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(500); 
        
        // Кликаем по переданной сумме
        await page.getByText(data.sum).first().click({ force: true });
        await page.waitForTimeout(500);

        // 3. ДАТЫ
        const dateRangeInput = page.locator('input[placeholder="дд.мм.гггг — дд.мм.гггг"]');
        await dateRangeInput.click({ force: true });
        await dateRangeInput.pressSequentially(data.dates, { delay: 50 }); 
        await dateRangeInput.press('Escape');
        await page.waitForTimeout(500);

        // 4. ЧЕКБОКСЫ
        await page.waitForTimeout(1000);

        if (data.activeRest) {
            await page.getByText('Активный вид отдыха').first().click({ force: true });
            await page.waitForTimeout(300);
        }
        if (data.covid) {
            await page.getByText('Хочу покрытие от COVID-19').first().click({ force: true });
            await page.waitForTimeout(300);
        }
        
        // 📸 Скриншот успешного Шага 1
        let step1Buffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: step1Buffer }, { caption: '📸 Шаг 1: Параметры страховки успешно заполнены' });

        await page.waitForTimeout(500); 
        await page.locator('button:has-text("Купить")').first().click({ force: true });


        // --- ШАГ 2: Контакты (Динамические) ---
        const phoneInput = page.locator('input[placeholder="+7(777)777-77-77"]');
        await phoneInput.click();
        await phoneInput.fill(data.phone);

        const emailInput = page.locator('input[placeholder="Введите почту"]');
        await emailInput.click();
        await emailInput.fill(data.email);

        // 📸 Скриншот успешного Шага 2
        let step2Buffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: step2Buffer }, { caption: '📸 Шаг 2: Контактные данные успешно сохранены' });

        await page.locator('button', { hasText: 'Далее' }).click();
        await page.waitForTimeout(1500);

        // --- ШАГ 3: Страхователь (РЕЗИДЕНТ) ---
        if (data.iin) {
            const iinInput = page.locator('input[placeholder="Введите ИИН"]');
            if (await iinInput.isVisible()) {
                await iinInput.click();
                await iinInput.fill(data.iin);
                await page.waitForTimeout(1000); 
            }
        }
        
        // ==========================================
        // БЛОК ЗАГРУЗКИ ДОКУМЕНТА (КАСТОМНЫЙ ДЛЯ МСТ)
        // ==========================================
        await progress.update(`📄 Загружаю ${data.docType} в CRM...`);
        await page.locator('text="Приложить документ"').first().click({ force: true });
        
        const uploadModal = page.getByRole('dialog', { name: 'Просим уточнить ваши данные' }).last();
        await uploadModal.waitFor({ state: 'visible' });

        // Выбираем тип документа в дропдауне (Паспорт / Удостоверение)
        const docTypeDropdown = uploadModal.locator('text="Паспорт"').first();
        if (await docTypeDropdown.isVisible()) {
            await docTypeDropdown.click();
            await page.waitForTimeout(500);
            await uploadModal.locator(`text="${data.docType}"`).first().click();
            await page.waitForTimeout(500);
        }

        // Загружаем файл
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser'),
            uploadModal.locator('text="Приложить документ"').first().click({ force: true })
        ]);
        await fileChooser.setFiles(downloadedFilePassport);
        
        const fileName = path.basename(downloadedFilePassport);
        await uploadModal.locator(`text="${fileName}"`).waitFor({ state: 'visible', timeout: 15000 });
        
        await uploadModal.locator('button', { hasText: 'Далее' }).click();
        await progress.update(`⏳ Ждём распознавания OCR...`);

        // Обработка окон успеха/ошибки OCR
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

        const mstModal = page.locator('[role="dialog"][aria-label="Просим уточнить ваши данные"]').first();
        if (await mstModal.isVisible()) {
            
            // Берем все инпуты внутри этого окна. Они идут строго по порядку.
            const modalInputs = mstModal.locator('input');

            // Читаем латиницу (индексы 0 и 1)
            const latinLast = await modalInputs.nth(0).inputValue();
            const latinFirst = await modalInputs.nth(1).inputValue();

            // Проверяем и заполняем Фамилию на русском (индекс 2)
            const currentRusLast = await modalInputs.nth(2).inputValue();
            if (!currentRusLast || currentRusLast.trim() === '') {
                await modalInputs.nth(2).fill(transliterateToCyrillic(latinLast));
            }

            // Проверяем и заполняем Имя на русском (индекс 3)
            const currentRusFirst = await modalInputs.nth(3).inputValue();
            if (!currentRusFirst || currentRusFirst.trim() === '') {
                await modalInputs.nth(3).fill(transliterateToCyrillic(latinFirst));
            }

            // Проверяем и заполняем Адрес прописки (индекс 4)
            const currentAddress = await modalInputs.nth(4).inputValue();
            if (!currentAddress || currentAddress.trim() === '') {
                await modalInputs.nth(4).fill(data.address);
            }

            // Пол (ищем текст заглушки "Выберите из списка")
            const genderPlaceholder = mstModal.locator('text="Выберите из списка", text="Выберите пол"').first();
            if (await genderPlaceholder.isVisible().catch(() => false)) {
                await genderPlaceholder.click({ force: true });
                await page.waitForTimeout(500);
                await page.getByText(data.gender, { exact: true }).last().click({ force: true });
                await page.waitForTimeout(300);
            }

            // Нажимаем Подтвердить
            const confirmBtn = mstModal.locator('button', { hasText: 'Подтвердить' }).last();
            await confirmBtn.scrollIntoViewIfNeeded();
            await confirmBtn.click({ force: true });
            
            // Ждем закрытия модалки
            await mstModal.waitFor({ state: 'hidden', timeout: 15000 });
        }
        
        await page.waitForTimeout(1000);

        const mainNextBtn = page.locator('button', { hasText: 'Далее' }).last();
        if (await mainNextBtn.isVisible().catch(() => false)) {
            await mainNextBtn.click();
        }

        // --- ШАГ 4: Оплата и создание полиса ---
        await progress.update('⏳ Проверяю расчет и создаю полис...');
        const createPolicyBtn = page.locator('button', { hasText: 'Создать полис' });
        await createPolicyBtn.waitFor({ state: 'visible', timeout: 15000 });

        const preCreateBuffer = await page.screenshot({ fullPage: true });
        await ctx.replyWithPhoto({ source: preCreateBuffer }, { caption: '📸 Данные страхователя подтверждены. Создаю полис МСТ...' });
        await createPolicyBtn.click();

        // --- ШАГ 5: Итоговый выпуск ---
        await progress.update('📝 Выпускаю полис МСТ...');
        const issuePolicyBtn = page.locator('button', { hasText: 'Выписать' });
        await issuePolicyBtn.waitFor({ state: 'visible', timeout: 25000 });
        await issuePolicyBtn.click();

        try {
            await page.waitForSelector('.success-message', { timeout: 15000 });
        } catch (e) {
            await page.waitForTimeout(3000); 
        }

        // --- ШАГ 4: Анкета и Выпуск ---
        await progress.update('⏳ Скачиваю анкету и выписываю полис...');

        // Оборачиваем в try/catch, чтобы перехватить скачивание файла и сразу удалить его из памяти бота
        try {
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 8000 }),
                page.getByText('Анкета заявления и КИД').first().click({ force: true })
            ]);
            await download.delete();
        } catch (e) {
            console.log('Скачивание не триггернулось как файл, продолжаем...');
        }
        await page.waitForTimeout(1000);

        await page.getByText('Выписать полис', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(1500);

        // --- ШАГ 5: Способ оплаты ---
        await progress.update('💳 Выбираю способ оплаты...');

        await page.getByText('Наличный расчёт').first().click({ force: true });
        await page.waitForTimeout(500);

        await page.locator('button', { hasText: 'Выписать полис' }).first().click({ force: true });

        // --- ШАГ 6: Финальная обработка ---
        await progress.update('📝 Регистрация в ЕСБД и выпуск сертификата...');

        // Ждем появления статусного окна
        await page.getByText('Оформляем полис').waitFor({ state: 'visible', timeout: 15000 });
        
        // Окно висит до минуты, пока крутится "Готовим сертификат..."
        // Ждем появления финальной кнопки "Мои полисы", которая означает 100% успех
        await page.getByText('Мои полисы').waitFor({ state: 'visible', timeout: 60000 });

        const finalBuffer = await page.screenshot({ fullPage: true });
        await progress.done('✅ Полис МСТ успешно выписан через WEB!');
        await ctx.replyWithPhoto({ source: finalBuffer }, { caption: `🎉 Полис МСТ готов!` });
        
    } catch (err) {
        console.error('[handleWebMst] Error:', err);
        
        // 📸 Обработка ошибки: делаем скриншот, если страница еще жива
        if (page) {
            try {
                const errBuffer = await page.screenshot({ fullPage: true });
                await ctx.replyWithPhoto({ source: errBuffer }, { caption: `❌ Ошибка на странице оформления:\n\n${err.message}` });
            } catch (screenshotErr) {
                console.error('Не удалось сделать скриншот ошибки:', screenshotErr);
            }
        }
        
        if (progress) await progress.fail(`Ошибка МСТ: ${err.message}`);
    } finally {
        // 🧹 Финальная очистка
        if (browser) await browser.close();
        if (downloadedFilePassport) {
            await fs.remove(downloadedFilePassport).catch(e => console.warn('Не удалось удалить файл:', e));
        }
    }
}

// Сцена для сбора документов и данных МСТ (Резидент)
const mstWizard = new Scenes.WizardScene(
    'MST_SCENE',
    async (ctx) => {
        await ctx.reply(
            'Начинаем оформление МСТ (Резидент) 🌐\n\n' +
            '1️⃣ Пожалуйста, отправьте фото или документ.\n' +
            '_Принимаются: Удостоверение личности, Паспорт или Водительское удостоверение._', 
            { parse_mode: 'Markdown' }
        );
        ctx.scene.session.mstData = {};
        return ctx.wizard.next();
    },
    async (ctx) => {
        const filePath = await downloadTelegramFile(ctx);
        if (!filePath) return ctx.reply('❌ Это не файл! Пожалуйста, отправьте картинку или PDF документа.');

        ctx.scene.session.mstData.passport = filePath;
        
        const promptMsg = `✅ Документ сохранен!\n\n2️⃣ Теперь отправьте данные для оформления **ОДНИМ СООБЩЕНИЕМ** в таком формате:\n\n` +
          `Документ: Удостоверение личности\n` +
          `Страна: Албания\n` +
          `Сумма: 30 000 EUR\n` +
          `Даты: 23092026-25092026\n` +
          `Телефон: +77777777777\n` +
          `Email: test@test.kz\n` +
          `ИИН: 040929500000\n` +
          `Адрес: ул. Абая 10\n` +
          `Пол: Мужской\n` +
          `Ковид: Да\n` +
          `Активный отдых: Нет`;
                          
        await ctx.reply(promptMsg);
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) {
            return ctx.reply('❌ Пожалуйста, отправьте текстовое сообщение с данными в указанном формате.');
        }

        const text = ctx.message.text;
        const data = ctx.scene.session.mstData;

        const extract = (key) => {
            const match = text.match(new RegExp(`${key}:\\s*(.+)`, 'i'));
            return match ? match[1].trim() : null;
        };

        data.docType = extract('Документ') || 'Удостоверение личности';
        data.country = extract('Страна') || 'Австрия';
        data.sum = extract('Сумма') || '30 000 EUR';
        data.dates = (extract('Даты') || '2309202626092026').replace(/\D/g, ''); 
        data.phone = extract('Телефон') || '+77787060026';
        data.email = extract('Email') || 'abdula.k@gmail.com';
        data.iin = extract('ИИН') || '';
        data.address = extract('Адрес') || 'ул. Абая 10';
        data.gender = extract('Пол') || 'Мужской';
        data.covid = extract('Ковид')?.toLowerCase() === 'да';
        data.activeRest = extract('Активный отдых')?.toLowerCase() === 'да';

        await ctx.reply('✅ Данные приняты! Запускаю браузер... 🤖');
        
        await handleWebMst(ctx, data);
        
        return ctx.scene.leave();
    }
);

module.exports = { handleWebMst, mstWizard };