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
      console.log(`[send] attempt ${i}: sending PDF ${pdfPath}`);
      await ctx.replyWithDocument(
        { source: fs.createReadStream(pdfPath), filename: `${safeName}.pdf` },
        { caption: `📄 ${testId} — ${feature}\nФайл: ${fileName}` }
      );
      console.log('[send] PDF sent successfully');
      return;
    } catch (err) {
      console.error(`[send] attempt ${i} failed:`, err.message);
      const isLastAttempt = i === attempts;
      if (isLastAttempt) {
        try {
          console.log('[send] fallback: sending .ts file');
          await ctx.replyWithDocument(
            { source: fs.createReadStream(tsPath), filename: `${safeName}.ts` },
            { caption: `📄 ${testId} — ${feature}\n(PDF не удалось, отправлен .ts)` }
          );
          console.log('[send] .ts file sent');
        } catch (err2) {
          console.error('[send] .ts fallback failed:', err2.message);
          await ctx.reply(`📄 ${testId} — тест сохранён локально: ${fileName}`).catch(() => {});
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
    console.log(`[test] start: feature="${feature}" url="${url}"`);
    progress = await new Progress(ctx, '🧠 AI генерирует тест').start();

    console.log('[test] calling generateTest...');
    const aiResponse = await generateTest(url, feature);
    console.log('[test] generateTest done, length:', aiResponse.length);

    await progress.update('💾 Сохраняю тест');
    const code = extractCodeBlock(aiResponse);
    const testId = await registerTest(feature, url, '');
    const { filePath, fileName } = await saveTest(code, feature, testId);
    console.log(`[test] saved: ${filePath}`);

    const reg = await getRegistry();
    if (reg[testId]) {
      reg[testId].file = filePath;
      const testsDir = process.env.TESTS_DIR || path.join(__dirname, '../../../tests');
      await fs.writeJson(path.join(testsDir, 'registry.json'), reg, { spaces: 2 });
    }

    await progress.update('📄 Отправляю файл');
    console.log('[test] generating PDF...');
    pdfPath = await generatePdf(`${testId}: ${feature}`, code);
    console.log('[test] PDF generated:', pdfPath);

    await progress.done(`✅ ${testId} — тест сгенерирован`);

    console.log('[test] sending file...');
    await sendWithRetry(ctx, pdfPath, filePath, testId, feature, fileName);
    console.log('[test] file sent');

    const runProgress = await new Progress(ctx, `🚀 Запускаю ${testId}`).start();

    console.log('[test] running playwright...');
    const { success, output } = await runTests(filePath);
    console.log(`[test] playwright done: success=${success}, output length=${output.length}`);
    await runProgress.done(formatTestResult(output, success, testId));

    if (!success) {
      let bugProgress = null;
      try {
        console.log('[test] starting bug analysis...');
        bugProgress = await new Progress(ctx, '🔍 AI анализирует причину падения').start();
        const analysis = await investigateBug(output);
        console.log('[test] bug analysis done, length:', analysis.length);
        await bugProgress.done(`📊 Анализ ошибки ${testId}`);
        const chunks = splitIntoChunks(analysis);
        for (const chunk of chunks) await ctx.reply(chunk);
        console.log('[test] all done');
      } catch (bugErr) {
        console.error('[testHandler] bug analysis error:', bugErr.message);
        if (bugProgress) await bugProgress.fail(bugErr.message);
      }
    } else {
      console.log('[test] all done (tests passed)');
    }
  } catch (err) {
    console.error('[testHandler] CAUGHT ERROR:', err.message);
    console.error('[testHandler] stack:', err.stack);
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
