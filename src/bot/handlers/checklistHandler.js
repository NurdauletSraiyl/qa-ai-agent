'use strict';

const { generateChecklist } = require('../../ai/client');
const { splitIntoChunks } = require('../../reporter/formatter');
const { Progress } = require('../progress');

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

  const progress = await new Progress(ctx, '🧠 AI генерирует QA чеклист').start();

  try {
    const checklist = await generateChecklist(url, feature);
    await progress.done(`✅ Чеклист готов: ${feature}`);

    const chunks = splitIntoChunks(`📋 QA Чеклист: ${feature}\n\n${checklist}`);
    for (const chunk of chunks) await ctx.reply(chunk);
  } catch (err) {
    console.error('[checklistHandler] error:', err.message);
    await progress.fail(err.message);
  }
}

module.exports = { handleChecklist };
