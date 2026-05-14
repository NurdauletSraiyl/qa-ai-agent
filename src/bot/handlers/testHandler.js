'use strict';

const { generateTest, investigateBug } = require('../../ai/client');
const { saveTest, runTests, validateUrl, extractCodeBlock } = require('../../runner/testRunner');
const { formatTestResult, splitIntoChunks } = require('../../reporter/formatter');
const { generatePdf } = require('../../reporter/pdfGenerator');
const fs = require('fs-extra');

function startTyping(ctx) {
  ctx.sendChatAction('typing').catch(() => {});
  return setInterval(() => ctx.sendChatAction('typing').catch(() => {}), 4000);
}

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

  let typingInterval = null;
  let pdfPath = null;

  try {
    await ctx.reply('🧠 AI генерирует Playwright тест...');
    typingInterval = startTyping(ctx);

    const aiResponse = await generateTest(url, feature);
    clearInterval(typingInterval);
    typingInterval = null;

    const code = extractCodeBlock(aiResponse);
    const { filePath } = await saveTest(code, feature);

    pdfPath = await generatePdf(`QA Test: ${feature}`, code);
    await ctx.replyWithDocument(
      { source: pdfPath, filename: `test_${feature.replace(/\s+/g, '_')}.pdf` },
      { caption: `📄 Playwright тест сгенерирован` }
    );

    await ctx.reply('🚀 Запускаю тест...');
    typingInterval = startTyping(ctx);

    const { success, output } = await runTests(filePath);
    clearInterval(typingInterval);
    typingInterval = null;

    await ctx.reply(formatTestResult(output, success));

    if (!success) {
      await ctx.reply('🔍 AI анализирует причину падения...');
      typingInterval = startTyping(ctx);
      const analysis = await investigateBug(output);
      clearInterval(typingInterval);
      typingInterval = null;

      const chunks = splitIntoChunks(`📊 Анализ ошибки\n\n${analysis}`);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    }
  } catch (err) {
    console.error('[testHandler] error:', err.message);
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  } finally {
    if (typingInterval) clearInterval(typingInterval);
    if (pdfPath) await fs.remove(pdfPath).catch(() => {});
  }
}

module.exports = { handleTest };
