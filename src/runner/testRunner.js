'use strict';

const { exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

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
  return code
    // Replace nullish coalescing with logical OR
    .replace(/\?\?/g, '||')
    // Replace optional chaining in template literals: ${x?.y} → ${x && x.y}
    .replace(/\$\{(\w+)\?\.([\w.]+)\}/g, (_, obj, prop) => `\${${obj} ? ${obj}.${prop} : ''}`)
    // Remove remaining optional chaining outside templates (e.g. foo?.bar → foo && foo.bar)
    .replace(/(\w+)\?\./g, '$1 && $1.')
    // Strip leading markdown fence if present
    .replace(/^```[a-z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

async function saveTest(code, featureName, testId) {
  const safeName = sanitizeFileName(featureName);
  const fileName = `${testId}_${safeName}.spec.ts`;
  const filePath = path.join('tests', 'ui', fileName);
  await fs.ensureDir(path.join('tests', 'ui'));
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
