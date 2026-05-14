'use strict';

const MAX_TELEGRAM_MSG = 3800;

function formatTestResult(output, success) {
  const icon = success ? '✅' : '❌';
  const label = success ? 'Tests passed' : 'Tests failed';
  const lines = output.split('\n').slice(-20).join('\n');
  return `${icon} *${label}*\n\n\`\`\`\n${lines}\n\`\`\``;
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

module.exports = { formatTestResult, splitIntoChunks };
