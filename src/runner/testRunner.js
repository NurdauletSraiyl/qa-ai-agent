'use strict';

const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const TESTS_DIR = process.env.TESTS_DIR || path.resolve(__dirname, '../../tests');

function sanitizeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'test';
}

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function extractCodeBlock(text) {
  const match = text.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/);
  const raw = match ? match[1].trim() : text.trim();
  return sanitizeCode(raw);
}

function sanitizeCode(code) {
  const cleaned = code
    .replace(/\?\?/g, '||')
    .replace(/\$\{(\w+)\?\.([\w.]+)\}/g, (_, obj, prop) => `\${${obj} ? ${obj}.${prop} : ''}`)
    .replace(/(\w+)\?\./g, '$1 && $1.')
    .replace(/^```[a-z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  return ensureBalanced(cleaned);
}

function ensureBalanced(code) {
  let open = 0;
  for (const ch of code) {
    if (ch === '{') open++;
    else if (ch === '}') open--;
  }
  // Append missing closing braces so Playwright can at least parse the file
  if (open > 0) {
    return code + '\n' + '});'.repeat(open);
  }
  return code;
}

async function saveTest(code, featureName, testId) {
  const safeName = sanitizeFileName(featureName);
  const fileName = `${testId}_${safeName}.spec.ts`;
  const uiDir = path.join(TESTS_DIR, 'ui');
  const filePath = path.join(uiDir, fileName);
  await fs.ensureDir(uiDir);
  await fs.writeFile(filePath, code, 'utf-8');
  return { filePath, safeName, fileName };
}

function runTests(specFile) {
  return new Promise((resolve) => {
    const safeSpec = specFile
      ? path.normalize(specFile).replace(/\.\./g, '')
      : null;

    const cmd = safeSpec
      ? `npx playwright test "${safeSpec}" --project=chromium --timeout=20000 --reporter=list`
      : 'npx playwright test --project=chromium --timeout=20000 --reporter=list';

    exec(cmd, { timeout: 60_000, cwd: process.cwd() }, (err, stdout, stderr) => {
      resolve({
        success: !err,
        output: (stdout || stderr || err?.message || 'No output').slice(0, 3000),
      });
    });
  });
}

module.exports = { saveTest, runTests, validateUrl, extractCodeBlock, sanitizeFileName };
