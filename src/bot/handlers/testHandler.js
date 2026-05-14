'use strict';

const { generateTest, investigateBug } = require('../../ai/client');
const { saveTest, runTests, validateUrl, extractCodeBlock } = require('../../runner/testRunner');
const { formatTestResult, splitIntoChunks } = require('../../reporter/formatter');

async function handleTest(ctx, args) {
  if (args.length < 2) {
    return ctx.reply(
      'Использование: `test <url> <описание фичи>`\n\nПример:\n`test https://cabinet.nomad.kz/login поле иин`',
      { parse_mode: 'Markdown' }
    );
  }

  const [url, ...featureParts] = args;
  const feature = featureParts.join(' ');

  if (!validateUrl(url)) {
    return ctx.reply('⚠️ Некорректный URL. Должен начинаться с http:// или https://');
  }

  const statusMsg = await ctx.reply('🧠 AI генерирует Playwright тест...');

  try {
    const aiResponse = await generateTest(url, feature);
    const code = extractCodeBlock(aiResponse);
    const { filePath } = await saveTest(code, feature);

    await ctx.reply(`📁 Тест создан: \`${filePath}\``, { parse_mode: 'Markdown' });
    await ctx.reply('🚀 Запускаю тест...');

    const { success, output } = await runTests(filePath);
    const report = formatTestResult(output, success);

    await ctx.reply(report);

    if (!success) {
      await ctx.reply('🔍 AI анализирует причину падения...');
      const analysis = await investigateBug(output);
      const chunks = splitIntoChunks(`📊 Анализ ошибки\n\n${analysis}`);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    }
  } catch (err) {
    console.error('[testHandler] error:', err.message);
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
}

module.exports = { handleTest };
