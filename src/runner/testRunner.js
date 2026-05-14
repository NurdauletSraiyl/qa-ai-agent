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

function parseJsonResults(jsonStr) {
  try {
    // Playwright may emit non-JSON lines before the JSON blob — find the first '{'
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    const data = JSON.parse(jsonStr.slice(start, end + 1));
    const tests = [];
    for (const suite of (data.suites || [])) {
      collectTests(suite, tests);
    }
    return tests;
  } catch {
    return null;
  }
}

function collectTests(suite, out) {
  for (const spec of (suite.specs || [])) {
    for (const test of (spec.tests || [])) {
      const result = (test.results || [])[0] || {};
      const error = result.error ? (result.error.message || '').split('\n')[0] : null;
      out.push({
        title: spec.title,
        status: result.status || 'unknown',
        error,
      });
    }
  }
  for (const child of (suite.suites || [])) {
    collectTests(child, out);
  }
}

function runTests(specFile, grepTitles) {
  return new Promise((resolve) => {
    const projectDir = path.dirname(TESTS_DIR);
    const safeSpec = specFile ? `"${path.resolve(specFile)}"` : null;

    let grep = '';
    if (grepTitles && grepTitles.length > 0) {
      const pattern = grepTitles.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      grep = ` --grep "${pattern}"`;
    }

    const cmd = safeSpec
      ? `npx playwright test ${safeSpec} --project=chromium --timeout=30000 --reporter=json${grep}`
      : `npx playwright test --project=chromium --timeout=30000 --reporter=json${grep}`;

    exec(cmd, { timeout: 300_000, cwd: projectDir, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      const tests = parseJsonResults(stdout);
      const allPassed = tests ? tests.every((t) => t.status === 'passed') : !err;
      const rawOutput = (stdout + stderr || err?.message || 'No output').slice(0, 3000);
      resolve({
        success: allPassed,
        output: rawOutput,
        tests,
      });
    });
  });
}

module.exports = { saveTest, runTests, validateUrl, extractCodeBlock, sanitizeFileName };
