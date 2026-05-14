'use strict';

const { generateTest, investigateBug } = require('../../ai/client');
const { saveTest, runTests, validateUrl, extractCodeBlock } = require('../../runner/testRunner');
const { registerTest, getRegistry, saveRegistry } = require('../../runner/testRegistry');
const { formatTestResult, formatMiniReport, splitIntoChunks } = require('../../reporter/formatter');
const { saveTestExcel, REPORTS_DIR } = require('../../reporter/excelGenerator');
const { Progress } = require('../progress');
const fs = require('fs-extra');
const path = require('path');

const TESTS_DIR = process.env.TESTS_DIR || path.join(__dirname, '../../../tests');

async function findScreenshot(testId) {
  try {
    const resultsDir = path.join(path.dirname(TESTS_DIR), 'test-results');
    if (!(await fs.pathExists(resultsDir))) return null;
    const since = Date.now() - 5 * 60 * 1000; // last 5 min
    const pngs = [];
    const walk = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (e.name.endsWith('.png')) {
          const stat = await fs.stat(full);
          if (stat.mtimeMs > since) pngs.push({ full, mtime: stat.mtimeMs });
        }
      }
    };
    await walk(resultsDir);
    if (!pngs.length) return null;
    pngs.sort((a, b) => b.mtime - a.mtime);
    return pngs[0].full;
  } catch {
    return null;
  }
}

async function saveRunResults(testId, tests, success) {
  try {
    const registry = await getRegistry();
    if (!registry[testId]) return;
    const passed = tests ? tests.filter(t => t.status === 'passed').length : 0;
    const total = tests ? tests.length : 0;
    registry[testId].lastRun = {
      date: new Date().toISOString(),
      passed,
      total,
      success,
    };
    registry[testId].lastFailed = tests
      ? tests.filter(t => t.status !== 'passed').map(t => t.title)
      : [];
    await saveRegistry(registry);
  } catch (e) {
    console.error('[saveRunResults] error:', e.message);
  }
}

async function handleTest(ctx, args) {
  if (args.length < 1) {
    return ctx.reply(
      'Использование: `test <url> <описание фичи>`\n\nПример:\n`test https://cabinet.nomad.kz/login поле иин`',
      { parse_mode: 'Markdown' }
    );
  }

  if (args[0].toLowerCase() === 'run')   return handleRunById(ctx, args[1]);
  if (args[0].toLowerCase() === 'retry') return handleRetry(ctx, args[1]);
  if (args[0].toLowerCase() === 'list')  return handleList(ctx);

  const [url, ...featureParts] = args;
  const feature = featureParts.join(' ');

  if (!validateUrl(url)) {
    return ctx.reply('⚠️ Некорректный URL. Должен начинаться с http:// или https://');
  }

  let progress = null;

  try {
    console.log(`[test] start: feature="${feature}" url="${url}"`);
    progress = await new Progress(ctx, '🧠 AI генерирует тест').start();

    const aiResponse = await generateTest(url, feature);
    console.log('[test] generateTest done, length:', aiResponse.length);

    await progress.update('💾 Сохраняю тест');
    const code = extractCodeBlock(aiResponse);
    const testId = await registerTest(feature, url, '');
    const { filePath, fileName } = await saveTest(code, feature, testId);
    console.log(`[test] saved: ${filePath}`);

    // Update file path in registry
    const reg = await getRegistry();
    if (reg[testId]) {
      reg[testId].file = filePath;
      await saveRegistry(reg);
    }

    await progress.done(`✅ ${testId} — тест сгенерирован`);
    await ctx.reply(`📄 ${testId} | ${feature}\nФайл: ${fileName}`);

    // Run tests
    const runProgress = await new Progress(ctx, `🚀 Запускаю ${testId}`).start();
    console.log('[test] running playwright...');
    const { success, output, tests } = await runTests(filePath);
    console.log(`[test] playwright done: success=${success}, tests=${tests ? tests.length : 'n/a'}`);

    // Save results to registry
    await saveRunResults(testId, tests, success);

    // Generate PDF with results
    const passed = tests ? tests.filter(t => t.status === 'passed').length : null;
    const total  = tests ? tests.length : null;
    const reg2 = await getRegistry();
    const xlsxPath = await saveTestExcel({
      testId, feature, url, fileName,
      createdAt: reg2[testId] ? reg2[testId].createdAt : new Date().toISOString(),
      testResults: tests || [],
      passed, total, success,
    });
    console.log('[test] PDF saved:', xlsxPath);

    const miniReport = formatMiniReport(tests, testId, feature);
    const resultText = miniReport || formatTestResult(output, success, testId, feature);
    await runProgress.done(resultText);
    await ctx.reply(`📊 Excel отчёт: ${xlsxPath}`);

    // Send screenshot on failure
    if (!success) {
      const screenshot = await findScreenshot(testId);
      if (screenshot) {
        try {
          await ctx.replyWithPhoto({ source: screenshot });
        } catch {}
      }
    }

    // Bug analysis on failure
    if (!success) {
      let bugProgress = null;
      try {
        bugProgress = await new Progress(ctx, '🔍 Анализирую ошибки').start();
        const failedTests = tests ? tests.filter(t => t.status !== 'passed') : [];
        const failureLog = failedTests.length > 0
          ? failedTests.map(t => `Test: ${t.title}\nError: ${t.error || 'unknown'}`).join('\n\n')
          : output.slice(0, 1500);
        const analysis = await investigateBug(failureLog);
        await bugProgress.done('🔍 Анализ завершён');
        await ctx.reply(analysis);
        console.log('[test] all done');
      } catch (bugErr) {
        console.error('[testHandler] bug analysis error:', bugErr.message);
        if (bugProgress) await bugProgress.fail(bugErr.message);
      }
    } else {
      console.log('[test] all done (tests passed)');
    }
  } catch (err) {
    console.error('[testHandler] CAUGHT ERROR:', err.message, err.stack);
    if (progress) await progress.fail(err.message);
    else await ctx.reply(`❌ ${err.message}`).catch(() => {});
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
      return ctx.reply(`❌ Тест ${id} не найден. Используй \`test list\` для просмотра.`, { parse_mode: 'Markdown' });
    }

    progress = await new Progress(ctx, `🚀 Запускаю ${id}: ${entry.feature}`).start();
    const { success, output, tests } = await runTests(entry.file);

    await saveRunResults(id, tests, success);

    const passed = tests ? tests.filter(t => t.status === 'passed').length : null;
    const total  = tests ? tests.length : null;
    const xlsxPath = await saveTestExcel({
      testId: id, feature: entry.feature, url: entry.url,
      fileName: path.basename(entry.file),
      createdAt: new Date().toISOString(),
      testResults: tests || [], passed, total, success,
    });

    const miniReport = formatMiniReport(tests, id, entry.feature);
    const resultText = miniReport || formatTestResult(output, success, id, entry.feature);
    await progress.done(resultText);
    await ctx.reply(`📊 Excel отчёт: ${xlsxPath}`);

    if (!success) {
      const screenshot = await findScreenshot(id);
      if (screenshot) {
        try { await ctx.replyWithPhoto({ source: screenshot }); } catch {}
      }
    }
  } catch (err) {
    console.error('[handleRunById] error:', err.message);
    if (progress) await progress.fail(err.message);
    else await ctx.reply(`❌ ${err.message}`).catch(() => {});
  }
}

async function handleRetry(ctx, rawId) {
  if (!rawId) {
    return ctx.reply('Использование: `test retry <TC-001>`', { parse_mode: 'Markdown' });
  }
  const id = rawId.toUpperCase();
  let progress = null;
  try {
    const registry = await getRegistry();
    const entry = registry[id];
    if (!entry) {
      return ctx.reply(`❌ Тест ${id} не найден.`);
    }

    const failedNames = entry.lastFailed || [];
    progress = await new Progress(ctx, `🔁 Retry ${id}${failedNames.length ? ` (${failedNames.length} упавших)` : ''}`).start();

    const { success, output, tests } = await runTests(entry.file, failedNames);

    await saveRunResults(id, tests, success);

    const passed = tests ? tests.filter(t => t.status === 'passed').length : null;
    const total  = tests ? tests.length : null;
    const xlsxPath = await saveTestExcel({
      testId: id, feature: entry.feature, url: entry.url,
      fileName: path.basename(entry.file),
      createdAt: new Date().toISOString(),
      testResults: tests || [], passed, total, success,
    });

    const miniReport = formatMiniReport(tests, id, entry.feature);
    const resultText = miniReport || formatTestResult(output, success, id, entry.feature);
    await progress.done(resultText);
    await ctx.reply(`📊 Excel отчёт: ${xlsxPath}`);
  } catch (err) {
    console.error('[handleRetry] error:', err.message);
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

    const lines = entries.map((e) => {
      const lr = e.lastRun;
      let status = '⬜ не запускался';
      if (lr) {
        const icon = lr.success ? '✅' : '❌';
        status = `${icon} ${lr.passed}/${lr.total}`;
      }
      return `${e.id}  ${e.feature}  ${status}${e.url ? '\n      ' + e.url : ''}`;
    });

    const text = `📋 Список тестов (${entries.length}):\n\n` + lines.join('\n\n');
    const chunks = splitIntoChunks(text);
    for (const chunk of chunks) await ctx.reply(chunk);
  } catch (err) {
    console.error('[handleList] error:', err.message);
    await ctx.reply(`❌ ${err.message}`).catch(() => {});
  }
}

async function handleRegress(ctx, args) {
  const filterUrl = args[0] || null;

  let progress = null;
  try {
    const registry = await getRegistry();
    let entries = Object.values(registry);

    if (!entries.length) {
      return ctx.reply('📭 Нет тестов для регресс-прогона. Сначала сгенерируй тесты командой `test`.', { parse_mode: 'Markdown' });
    }

    // Keep only the latest TC per (url+feature) pair
    const latestMap = {};
    for (const e of entries) {
      const key = `${e.url}||${e.feature}`;
      if (!latestMap[key] || e.id > latestMap[key].id) latestMap[key] = e;
    }
    let toRun = Object.values(latestMap);

    if (filterUrl) {
      toRun = toRun.filter(e => e.url && e.url.includes(filterUrl));
      if (!toRun.length) {
        return ctx.reply(`❌ Нет тестов для URL содержащего: ${filterUrl}`);
      }
    }

    await ctx.reply(`🔁 Регресс-прогон: ${toRun.length} тест-сьют(ов)\n${toRun.map(e => `• ${e.id} — ${e.feature}`).join('\n')}`);

    const results = [];

    for (const entry of toRun) {
      progress = await new Progress(ctx, `🚀 ${entry.id}: ${entry.feature}`).start();
      const prevPassed = entry.lastRun ? entry.lastRun.success : null;

      try {
        const { success, output, tests } = await runTests(entry.file);
        await saveRunResults(entry.id, tests, success);

        const passed  = tests ? tests.filter(t => t.status === 'passed').length : 0;
        const total   = tests ? tests.length : 0;

        // Classify
        let verdict;
        if (prevPassed === true  && !success) verdict = '🔴 РЕГРЕССИЯ';
        else if (prevPassed === false && success) verdict = '🟢 ПОЧИНЕНО';
        else if (success)                         verdict = '✅ ОК';
        else                                      verdict = '❌ ИЗВЕСТНАЯ ОШИБКА';

        results.push({ entry, success, passed, total, tests, verdict, prevPassed });

        const miniReport = formatMiniReport(tests, entry.id, entry.feature);
        await progress.done(`${verdict} | ${miniReport || `${passed}/${total}`}`);
      } catch (err) {
        results.push({ entry, success: false, passed: 0, total: 0, tests: null, verdict: '⚠️ ОШИБКА', prevPassed });
        await progress.fail(err.message);
      }
    }

    // Summary
    const regressions = results.filter(r => r.verdict.includes('РЕГРЕССИЯ'));
    const fixed       = results.filter(r => r.verdict.includes('ПОЧИНЕНО'));
    const ok          = results.filter(r => r.verdict.includes('ОК'));
    const known       = results.filter(r => r.verdict.includes('ИЗВЕСТНАЯ'));

    const summaryLines = [
      `📊 Регресс завершён (${toRun.length} сьютов)`,
      ``,
      `🔴 Регрессии: ${regressions.length}`,
      `🟢 Починено:  ${fixed.length}`,
      `✅ Без изменений (OK): ${ok.length}`,
      `❌ Известные ошибки: ${known.length}`,
    ];

    if (regressions.length) {
      summaryLines.push(`\nНовые поломки:`);
      for (const r of regressions) summaryLines.push(`  • ${r.entry.id} — ${r.entry.feature} (${r.passed}/${r.total})`);
    }

    await ctx.reply(summaryLines.join('\n'));

    // Excel report for the whole regress run
    const allTests = results.flatMap(r => (r.tests || []).map(t => ({
      ...t,
      title: `[${r.entry.id}] ${t.title}`,
    })));
    const totalPassed = results.reduce((s, r) => s + r.passed, 0);
    const totalTests  = results.reduce((s, r) => s + r.total, 0);
    const overallOk   = regressions.length === 0;

    const xlsxPath = await saveTestExcel({
      testId: 'REGRESS',
      feature: `Регресс-прогон (${toRun.length} сьютов)`,
      url: filterUrl || 'все URL',
      fileName: '—',
      createdAt: new Date().toISOString(),
      testResults: allTests,
      passed: totalPassed,
      total: totalTests,
      success: overallOk,
    });

    await ctx.reply(`📊 Excel отчёт: ${xlsxPath}`);
  } catch (err) {
    console.error('[handleRegress] error:', err.message, err.stack);
    if (progress) await progress.fail(err.message);
    else await ctx.reply(`❌ ${err.message}`).catch(() => {});
  }
}

module.exports = { handleTest, handleRegress };
