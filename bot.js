'use strict';

const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const { Telegraf, session, Scenes } = require('telegraf');
const { authMiddleware } = require('./src/bot/middleware/auth');
const { rateLimitMiddleware } = require('./src/bot/middleware/rateLimit');
const { handleTest, handleRegress } = require('./src/bot/handlers/testHandler');
const { handleChecklist } = require('./src/bot/handlers/checklistHandler');
const { handleInvestigate } = require('./src/bot/handlers/investigateHandler');
const { handlePolicy } = require('./src/bot/handlers/policyHandler');
const { ogpoWizard } = require('./src/bot/handlers/webOgpoPolicyHandler');
const { ogpoLegalWizard } = require('./src/bot/handlers/webOgpoLegalEntityPolicyHandlers');
const { mstWizard } = require('./src/bot/handlers/webMstPolicyHandler');
const { nsWizard } = require('./src/bot/handlers/webNsPolicyHandlers');

const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 10 * 60 * 1000, // 10 minutes — AI gen + PDF upload + playwright
});

const stage = new Scenes.Stage([ogpoWizard, ogpoLegalWizard, mstWizard, nsWizard]);

bot.use(session());
bot.use(stage.middleware());

const HELP_TEXT = `🤖 *QA AI Agent*

*Команды:*

\`test <url> <фича>\`
Сгенерировать AI тест (получишь PDF) и запустить
_Пример: test https://cabinet.nomad.kz/login поле иин_

\`test list\`
Список всех сгенерированных тестов с ID

\`test run <TC\\-001>\`
Запустить тест по ID
_Пример: test run TC\\-001_

\`checklist <url> <фича>\`
Сгенерировать QA чеклист
_Пример: checklist https://cabinet.nomad.kz/login поле иин_

\`test retry <TC\\-001>\`
Перезапустить только упавшие тесты из прогона
_Пример: test retry TC\\-001_

\`regress\`
Регресс\\-прогон всех тестов \\(последний TC на каждую фичу\\)
_Пример: regress_
_Пример: regress cabinet.nomad.kz_ \\(фильтр по URL\\)

\`investigate <лог ошибки>\`
Анализ причины падения теста

\`policy <ns\\|ogpo\\|mst> <иин\\|номер\\|list>\`
Получить уже выписанные полисы через API NDP
_Пример: policy ns list_
_Пример: policy ns 820921300652_
_Пример: policy ns NS\\-2025\\-000099_

\`web ogpo <phis\|legal>\`
Оформить полис ОГПО (Playwright + OCR + CRM)
_Пример: web ogpo phis_ — для физических лиц
_Пример: web ogpo legal_ — для юридических лиц

\`web mst\`
Оформить полис МСТ (Playwright + OCR + CRM)

\`web ns\`
Оформить полис НС (Playwright + OCR + CRM)

\`stats\`
Проверить нагрузку на сервер (CPU / RAM)

\`help\`
Показать это сообщение`;

bot.use(authMiddleware);

bot.start((ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));
bot.help((ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));

bot.command('stats', async (ctx) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // Переводим байты в мегабайты
  const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

  const cpus = os.cpus();
  const cores = cpus.length;
  // loadavg возвращает среднюю нагрузку за 1, 5 и 15 минут
  const loadAvg = os.loadavg()[0].toFixed(2); 

  const text = `*Ресурсы сервера (ОС/Docker)*\n\n` +
               `*CPU:* ${cores} ядер(а) | Нагрузка (1м): ${loadAvg}\n` +
               `*RAM (Память):*\n` +
               `• Всего: ${toMB(totalMem)} MB\n` +
               `• Занято: ${toMB(usedMem)} MB\n` +
               `• Свободно: ${toMB(freeMem)} MB\n\n` +
               `_ Как замерять:_\n` +
               `1. Вызови /stats в состоянии покоя.\n` +
               `2. Запусти оформление полиса.\n` +
               `3. Сразу вызови /stats еще раз (пока бот "ждет расчет").\n` +
               `4. Разница в "Занято" = вес 1 сессии Playwright.`;

  return ctx.reply(text, { parse_mode: 'Markdown' });
});

bot.on(['text', 'photo', 'document'], async (ctx) => {
  const text = (ctx.message.text || ctx.message.caption || '').trim();

  if (!text || text.startsWith('/')) return;

  const [command, ...args] = text.split(/\s+/);

  switch (command.toLowerCase()) {
    case 'test':
      return rateLimitMiddleware(ctx, () => handleTest(ctx, args));

    case 'regress':
      return rateLimitMiddleware(ctx, () => handleRegress(ctx, args));

    case 'checklist':
      return rateLimitMiddleware(ctx, () => handleChecklist(ctx, args));

    case 'investigate':
      return handleInvestigate(ctx, args);

    case 'policy':
      return rateLimitMiddleware(ctx, () => handlePolicy(ctx, args));

    case 'web': {
      const subCommand = args.join(' ').toLowerCase();

      if (subCommand === 'ogpo phis') {
        return rateLimitMiddleware(ctx, () => ctx.scene.enter('OGPO_SCENE'));
      } if (subCommand === 'ogpo legal') {
        return rateLimitMiddleware(ctx, () => ctx.scene.enter('OGPO_LEGAL_SCENE'));
      } if (subCommand === 'mst') {
        return rateLimitMiddleware(ctx, () => ctx.scene.enter('MST_SCENE'));
      } if (subCommand === 'ns')  {
        return rateLimitMiddleware(ctx, () => ctx.scene.enter('NS_SCENE'));
      } else {
        return ctx.reply(
          '⚠️ Пожалуйста, укажите верный продукт. Доступные команды:\n`web ogpo phis`, `web ogpo legal`, `web mst`, `web ns`', 
          { parse_mode: 'Markdown' }
        )
      }
    }

    case 'help':
      return ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });

    default:
      return ctx.reply(
        '❓ Неизвестная команда. Напиши `help` для списка команд.',
        { parse_mode: 'Markdown' }
      );
  }
});

bot.catch((err, ctx) => {
  const msg = err.message || '';
  console.error('[bot.catch] error:', msg);
  console.error('[bot.catch] stack:', err.stack);
  if (msg.includes('socket hang up') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) {
    console.warn('[bot.catch] network error (ignored):', msg);
    return;
  }
  ctx.reply('❌ Произошла неожиданная ошибка. Попробуй ещё раз.').catch(() => {});
});

if (require.main === module) {
  bot.launch({ dropPendingUpdates: true });
  console.log('🤖 QA AI Agent running...');
};

module.exports = bot;

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
