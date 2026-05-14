'use strict';

const { generateTest, investigateBug } = require('../../ai/client');
const { saveTest, runTests, validateUrl, extractCodeBlock } = require('../../runner/testRunner');
const { registerTest, getRegistry } = require('../../runner/testRegistry');
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

  // Handle: test run <TC-ID>
  if (args[0].toLowerCase() === 'run') {
    return handleRunById(ctx, args[1]);
  }

  // Handle: test list
  if (args[0].toLowerCase() === 'list') {
    return handleList(ctx);
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

    // Register test and get ID before saving
    const testId = await registerTest(feature, url, '');
    const { filePath, fileName } = await saveTest(code, feature, testId);

    // Update registry with real file path
    const { getRegistry: gr } = require('../../runner/testRegistry');
    const reg = await gr();
    if (reg[testId]) {
      reg[testId].file = filePath;
      const fs2 = require('fs-extra');
      await fs2.writeJson(require('path').join('tests', 'registry.json'), reg, { spaces: 2 });
    }

    pdfPath = await generatePdf(`${testId}: ${feature}`, code);
    await ctx.replyWithDocument(
      { source: pdfPath, filename: `${testId}_${feature.replace(/\s+/g, '_')}.pdf` },
      { caption: `📄 ${testId} — ${feature}\nФайл: ${fileName}` }
    );

    await ctx.reply(`🚀 Запускаю тест ${testId}...`);
    typingInterval = startTyping(ctx);

    const { success, output } = await runTests(filePath);
    clearInterval(typingInterval);
    typingInterval = null;

    await ctx.reply(formatTestResult(output, success, testId));

    if (!success) {
      await ctx.reply('🔍 AI анализирует причину падения...');
      typingInterval = startTyping(ctx);
      const analysis = await investigateBug(output);
      clearInterval(typingInterval);
      typingInterval = null;

      const chunks = splitIntoChunks(`📊 Анализ ошибки ${testId}\n\n${analysis}`);
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

async function handleRunById(ctx, rawId) {
  if (!rawId) {
    return ctx.reply('Использование: `test run <TC-001>`', { parse_mode: 'Markdown' });
  }
  const id = rawId.toUpperCase();
  const registry = await getRegistry();
  const entry = registry[id];

  if (!entry) {
    return ctx.reply(`❌ Тест ${id} не найден. Используй \`test list\` для просмотра.`, {
      parse_mode: 'Markdown',
    });
  }

  await ctx.reply(`🚀 Запускаю ${id}: ${entry.feature}...`);
  const typingInterval = startTyping(ctx);

  try {
    const { success, output } = await runTests(entry.file);
    clearInterval(typingInterval);
    await ctx.reply(formatTestResult(output, success, id));
  } catch (err) {
    clearInterval(typingInterval);
    await ctx.reply(`❌ Ошибка: ${err.message}`);
  }
}

async function handleList(ctx) {
  const registry = await getRegistry();
  const entries = Object.values(registry);

  if (!entries.length) {
    return ctx.reply('📭 Тестов пока нет. Используй `test <url> <фича>` для генерации.', {
      parse_mode: 'Markdown',
    });
  }

  const lines = entries.map(
    (e) => `${e.id}  ${e.feature}${e.url ? '\n      ' + e.url : ''}`
  );
  const text = `📋 Список тестов (${entries.length}):\n\n` + lines.join('\n\n');
  const chunks = splitIntoChunks(text);
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

module.exports = { handleTest };
