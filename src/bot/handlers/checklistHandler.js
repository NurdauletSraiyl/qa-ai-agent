'use strict';

const { generateChecklist } = require('../../ai/client');
const { splitIntoChunks } = require('../../reporter/formatter');

async function handleChecklist(ctx, args) {
  if (args.length < 1) {
    return ctx.reply(
      'Usage:\n`checklist <url> <feature>`\nor\n`checklist <feature>`\n\nExamples:\n`checklist https://site.com iin field`\n`checklist login form validation`',
      { parse_mode: 'Markdown' }
    );
  }

  let url = null;
  let featureParts = args;

  if (args[0].startsWith('http://') || args[0].startsWith('https://')) {
    url = args[0];
    featureParts = args.slice(1);
  }

  const feature = featureParts.join(' ');
  if (!feature.trim()) {
    return ctx.reply('⚠️ Please provide a feature description after the URL.');
  }

  await ctx.reply('🧠 AI is generating QA checklist...');

  try {
    const checklist = await generateChecklist(url, feature);
    const header = `📋 *QA Checklist: ${feature}*\n\n`;
    const chunks = splitIntoChunks(header + checklist);

    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('[checklistHandler] error:', err.message);
    await ctx.reply(`❌ Error: ${err.message}`);
  }
}

module.exports = { handleChecklist };
