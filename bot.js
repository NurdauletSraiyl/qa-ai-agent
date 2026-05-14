'use strict';

require('dotenv').config();

const { Telegraf } = require('telegraf');
const { authMiddleware } = require('./src/bot/middleware/auth');
const { rateLimitMiddleware } = require('./src/bot/middleware/rateLimit');
const { handleTest } = require('./src/bot/handlers/testHandler');
const { handleChecklist } = require('./src/bot/handlers/checklistHandler');
const { handleInvestigate } = require('./src/bot/handlers/investigateHandler');

const bot = new Telegraf(process.env.BOT_TOKEN);

const HELP_TEXT = `🤖 *QA AI Agent*

*Commands:*

\`test <url> <feature>\`
Generate AI test & run it
_Example: test https://site.com login form_

\`checklist <url> <feature>\`
Generate deep QA checklist
_Example: checklist https://site.com iin field_

\`investigate <error log>\`
AI root cause analysis
_Example: investigate TimeoutError: locator not found_

\`help\`
Show this message`;

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

    case 'checklist':
      return rateLimitMiddleware(ctx, () => handleChecklist(ctx, args));

    case 'investigate':
      return handleInvestigate(ctx, args);

    case 'help':
      return ctx.reply(HELP_TEXT, { parse_mode: 'Markdown' });

    default:
      return ctx.reply(
        '❓ Unknown command. Type `help` for available commands.',
        { parse_mode: 'Markdown' }
      );
  }
});

bot.catch((err, ctx) => {
  console.error('[bot] unhandled error:', err.message);
  ctx.reply('❌ An unexpected error occurred. Please try again.').catch(() => {});
});

bot.launch({ dropPendingUpdates: true });
console.log('🤖 QA AI Agent running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
