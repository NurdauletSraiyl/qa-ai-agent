'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const { Telegraf } = require('telegraf');
const { authMiddleware } = require('./src/bot/middleware/auth');
const { rateLimitMiddleware } = require('./src/bot/middleware/rateLimit');
const { handleTest, handleRegress } = require('./src/bot/handlers/testHandler');
const { handleChecklist } = require('./src/bot/handlers/checklistHandler');
const { handleInvestigate } = require('./src/bot/handlers/investigateHandler');
const { handleIssue } = require('./src/bot/handlers/issueHandler');

const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 10 * 60 * 1000, // 10 minutes — AI gen + PDF upload + playwright
});

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

\`issue <ns\\|mst\\|mst\\-premium>\`
Выписать полис через API NDP \\(JSON тела запроса — следующими строками\\)
_Пример: issue ns_ \\(без JSON покажет образец payload'а\\)
_Пример: issue mst_ \\(без JSON покажет образец payload'а\\)
_Пример: issue mst\\-premium_ \\(без JSON покажет образец payload'а\\)

\`help\`
Показать это сообщение`;

bot.use(authMiddleware);

bot.start((ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));
bot.help((ctx) => ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' }));

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  if (text.startsWith('/')) return;

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

    case 'issue':
      return rateLimitMiddleware(ctx, () => handleIssue(ctx, text));

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

bot.launch({ dropPendingUpdates: true });
console.log('🤖 QA AI Agent running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
