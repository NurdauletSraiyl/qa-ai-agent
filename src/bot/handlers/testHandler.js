'use strict';

const { generateTest, investigateBug } = require('../../ai/client');
const { saveTest, runTests, validateUrl, extractCodeBlock } = require('../../runner/testRunner');
const { formatTestResult, splitIntoChunks } = require('../../reporter/formatter');
const { generatePdf } = require('../../reporter/pdfGenerator');
const fs = require('fs-extra');

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

  await ctx.reply('🧠 AI генерирует Playwright тест...');

  let pdfPath = null;

  try {
    const aiResponse = await generateTest(url, feature);
    const code = extractCodeBlock(aiResponse);
    const { filePath } = await saveTest(code, feature);

    // Send test code as PDF
    pdfPath = await generatePdf(`QA Test: ${feature}`, code);
    await ctx.replyWithDocument(
      { source: pdfPath, filename: `test_${feature.replace(/\s+/g, '_')}.pdf` },
      { caption: `📄 Playwright тест: ${feature}` }
    );

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
  } finally {
    if (pdfPath) await fs.remove(pdfPath).catch(() => {});
  }
}

module.exports = { handleTest };
