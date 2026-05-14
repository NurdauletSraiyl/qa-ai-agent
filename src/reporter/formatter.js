'use strict';

const MAX_TELEGRAM_MSG = 3800;

function formatTestResult(output, success, testId, feature) {
  const icon = success ? '✅' : '❌';
  const status = success ? 'Тесты прошли' : 'Тесты упали';
  const parts = [icon];
  if (testId) parts.push(testId);
  if (feature) parts.push(feature);
  parts.push(status);
  const header = parts.join(' | ');
  const lines = output.split('\n').slice(-20).join('\n');
  return `${header}\n\n${lines}`;
}

function splitIntoChunks(text, maxLen = MAX_TELEGRAM_MSG) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if ((current + line + '\n').length > maxLen) {
      if (current) chunks.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text.slice(0, maxLen)];
}

// Strip ANSI escape codes from error messages
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '').replace(/\[[\d;]*m/g, '').trim();
}

function formatMiniReport(tests, testId, feature) {
  if (!tests || !tests.length) return null;

  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status !== 'passed').length;
  const icon = failed === 0 ? '✅' : '❌';

  const lines = [`${icon} ${testId} | ${feature} | ${passed}/${tests.length} прошло`];

  for (const t of tests) {
    if (t.status === 'passed') {
      lines.push(`  ✓ ${t.title}`);
    } else {
      const rawErr = t.error ? stripAnsi(t.error).split('\n')[0].slice(0, 120) : '';
      const errMsg = rawErr ? ` — Ошибка: ${rawErr}` : '';
      lines.push(`  ✗ ${t.title}${errMsg}`);
    }
  }

  return lines.join('\n');
}

module.exports = { formatTestResult, formatMiniReport, splitIntoChunks };
