'use strict';

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
const { mstWizard } = require('./src/bot/handlers/webMstPolicyHandler');
const { nsWizard } = require('./src/bot/handlers/webNsPolicyHandlers');

const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 10 * 60 * 1000, // 10 minutes — AI gen + PDF upload + playwright
});

const stage = new Scenes.Stage([ogpoWizard, mstWizard, nsWizard]);

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

\`web ogpo\`
Оформить полис ОГПО (Playwright + OCR + CRM)

\`web mst\`
Оформить полис МСТ (Playwright + OCR + CRM)

\`web ns\`
Оформить полис НС (Playwright + OCR + CRM)

\`help\`
Показать это сообщение`;

bot.use(authMiddleware);

bot.start((ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));
bot.help((ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));

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
      const subCommand = args[0] ? args[0].toLowerCase() : '';

      if (subCommand == 'ogpo') {
        return rateLimitMiddleware(ctx, () => ctx.scene.enter('OGPO_SCENE')); 
      } if (subCommand == 'mst') {
        return rateLimitMiddleware(ctx, () => ctx.scene.enter('MST_SCENE'));
      } if (subCommand == 'ns')  {
        return rateLimitMiddleware(ctx, () => ctx.scene.enter('NS_SCENE'));
      } else {
        return ctx.reply(
          '⚠️ Пожалуйста, укажите продукт. Доступная команда:\n`web ogpo`, `web mst`, `web ns`', 
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
