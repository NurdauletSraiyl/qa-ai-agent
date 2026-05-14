'use strict';

const { generateTest, investigateBug } = require('../../ai/client');
const { saveTest, runTests, validateUrl, extractCodeBlock } = require('../../runner/testRunner');
const { registerTest, getRegistry } = require('../../runner/testRegistry');
const { formatTestResult, splitIntoChunks } = require('../../reporter/formatter');
const { generatePdf } = require('../../reporter/pdfGenerator');
const { Progress } = require('../progress');
const fs = require('fs-extra');
const path = require('path');

async function sendWithRetry(ctx, pdfPath, tsPath, testId, feature, fileName, attempts = 3) {
  const safeName = `${testId}_${feature.replace(/\s+/g, '_')}`;

  for (let i = 1; i <= attempts; i++) {
    try {
      await ctx.replyWithDocument(
        { source: pdfPath, filename: `${safeName}.pdf` },
        { caption: `📄 ${testId} — ${feature}\nФайл: ${fileName}` }
      );
      return;
    } catch (err) {
      const isLastAttempt = i === attempts;
      if (isLastAttempt) {
        // Fallback: send the .ts source file directly
        try {
          await ctx.replyWithDocument(
            { source: tsPath, filename: `${safeName}.ts` },
            { caption: `📄 ${testId} — ${feature}\n(отправлен .ts, PDF не удалось)` }
          );
        } catch {
          await ctx.reply(`📄 ${testId} — тест сохранён: ${fileName}`);
        }
      } else {
        await new Promise((r) => setTimeout(r, i * 2000));
      }
    }
  }
}

async function handleTest(ctx, args) {
  if (args.length < 1) {
    return ctx.reply(
      'Использование: `test <url> <описание фичи>`\n\nПример:\n`test https://cabinet.nomad.kz/login поле иин`',
      { parse_mode: 'Markdown' }
    );
  }

  if (args[0].toLowerCase() === 'run') return handleRunById(ctx, args[1]);
  if (args[0].toLowerCase() === 'list') return handleList(ctx);

  const [url, ...featureParts] = args;
  const feature = featureParts.join(' ');

  if (!validateUrl(url)) {
    return ctx.reply('⚠️ Некорректный URL. Должен начинаться с http:// или https://');
  }

  let progress = null;
  let pdfPath = null;

  try {
    progress = await new Progress(ctx, '🧠 AI генерирует тест').start();
    const aiResponse = await generateTest(url, feature);

    await progress.update('💾 Сохраняю тест');
    const code = extractCodeBlock(aiResponse);
    const testId = await registerTest(feature, url, '');
    const { filePath, fileName } = await saveTest(code, feature, testId);

    // Update registry with real file path
    const reg = await getRegistry();
    if (reg[testId]) {
      reg[testId].file = filePath;
      await fs.writeJson(path.join('tests', 'registry.json'), reg, { spaces: 2 });
    }

    await progress.update('📄 Отправляю файл');
    pdfPath = await generatePdf(`${testId}: ${feature}`, code);

    await progress.done(`✅ ${testId} — тест сгенерирован`);

    await sendWithRetry(ctx, pdfPath, filePath, testId, feature, fileName);

    const runProgress = await new Progress(ctx, `🚀 Запускаю ${testId}`).start();

    const { success, output } = await runTests(filePath);
    await runProgress.done(formatTestResult(output, success, testId));

    if (!success) {
      let bugProgress = null;
      try {
        bugProgress = await new Progress(ctx, '🔍 AI анализирует причину падения').start();
        const analysis = await investigateBug(output);
        await bugProgress.done(`📊 Анализ ошибки ${testId}`);
        const chunks = splitIntoChunks(analysis);
        for (const chunk of chunks) await ctx.reply(chunk);
      } catch (bugErr) {
        console.error('[testHandler] bug analysis error:', bugErr.message);
        if (bugProgress) await bugProgress.fail(bugErr.message);
      }
    }
  } catch (err) {
    console.error('[testHandler] error:', err.message);
    if (progress) await progress.fail(err.message);
    else await ctx.reply(`❌ ${err.message}`).catch(() => {});
  } finally {
    if (pdfPath) await fs.remove(pdfPath).catch(() => {});
  }
}

async function handleRunById(ctx, rawId) {
  if (!rawId) {
    return ctx.reply('Использование: `test run <TC-001>`', { parse_mode: 'Markdown' });
  }
  const id = rawId.toUpperCase();

  let progress = null;
  try {
    const registry = await getRegistry();
    const entry = registry[id];

    if (!entry) {
      return ctx.reply(`❌ Тест ${id} не найден. Используй \`test list\` для просмотра.`, {
        parse_mode: 'Markdown',
      });
    }

    progress = await new Progress(ctx, `🚀 Запускаю ${id}: ${entry.feature}`).start();
    const { success, output } = await runTests(entry.file);
    await progress.done(formatTestResult(output, success, id));
  } catch (err) {
    console.error('[handleRunById] error:', err.message);
    if (progress) await progress.fail(err.message);
    else await ctx.reply(`❌ ${err.message}`).catch(() => {});
  }
}

async function handleList(ctx) {
  try {
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
    for (const chunk of chunks) await ctx.reply(chunk);
  } catch (err) {
    console.error('[handleList] error:', err.message);
    await ctx.reply(`❌ ${err.message}`).catch(() => {});
  }
}

module.exports = { handleTest };
