'use strict';

const { generateChecklist } = require('../../ai/client');
const { splitIntoChunks } = require('../../reporter/formatter');

async function handleChecklist(ctx, args) {
  if (args.length < 1) {
    return ctx.reply(
      'Использование:\n`checklist <url> <фича>`\nили\n`checklist <фича>`\n\nПримеры:\n`checklist https://cabinet.nomad.kz/login поле иин`\n`checklist валидация формы входа`',
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
    return ctx.reply('⚠️ Укажи описание фичи после URL.');
  }

  await ctx.reply('🧠 AI генерирует QA чеклист...');

  try {
    const checklist = await generateChecklist(url, feature);
    const header = `📋 *QA Чеклист: ${feature}*\n\n`;
    const chunks = splitIntoChunks(header + checklist);

    for (const chunk of chunks) {
      await ctx.reply(chunk, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('[checklistHandler] error:', err.message);
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
}

module.exports = { handleChecklist };
