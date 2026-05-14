'use strict';

const { investigateBug } = require('../../ai/client');
const { splitIntoChunks } = require('../../reporter/formatter');

function startTyping(ctx) {
  ctx.sendChatAction('typing').catch(() => {});
  return setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 4000);
}

async function handleInvestigate(ctx, args) {
  const log = args.join(' ').trim();

  if (!log) {
    return ctx.reply(
      'Использование: `investigate <вставь лог ошибки>`\n\nПример:\n`investigate TimeoutError: waiting for locator...`',
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply('🔍 AI анализирует причину падения...');
  const typingInterval = startTyping(ctx);

  try {
    const analysis = await investigateBug(log);
    clearInterval(typingInterval);
    const chunks = splitIntoChunks(`🔬 Анализ ошибки\n\n${analysis}`);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
  } catch (err) {
    clearInterval(typingInterval);
    console.error('[investigateHandler] error:', err.message);
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
}

module.exports = { handleInvestigate };
