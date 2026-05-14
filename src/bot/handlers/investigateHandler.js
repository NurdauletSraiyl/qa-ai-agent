'use strict';

const { investigateBug } = require('../../ai/client');
const { splitIntoChunks } = require('../../reporter/formatter');

async function handleInvestigate(ctx, args) {
  const log = args.join(' ').trim();

  if (!log) {
    return ctx.reply(
      'Usage: `investigate <paste error log here>`\n\nExample:\n`investigate TimeoutError: waiting for locator...`',
      { parse_mode: 'Markdown' }
    );
  }

  await ctx.reply('🔍 AI is investigating the failure...');

  try {
    const analysis = await investigateBug(log);
    const chunks = splitIntoChunks(`🔬 *Failure Analysis*\n\n${analysis}`);
    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('[investigateHandler] error:', err.message);
    await ctx.reply(`❌ Error: ${err.message}`);
  }
}

module.exports = { handleInvestigate };
