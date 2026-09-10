'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { loadPrompt } = require('./promptLoader');

const MODEL = 'claude-opus-4-7';

let _anthropic = null;

function getClient() {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY не задан в .env файле');
    }
    // timeout: 10 min — streaming prevents idle disconnects, but keep a hard ceiling
    _anthropic = new Anthropic({ apiKey, timeout: 600_000 });
  }
  return _anthropic;
}

// Use streaming so long thinking sessions don't hit network idle timeouts
async function streamMessage(params) {
  const stream = await getClient().messages.stream(params);
  return stream.finalMessage();
}

async function generateTest(url, feature) {
  const systemPrompt = await loadPrompt('qa-test-generator');

  const response = await streamMessage({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Generate a Playwright TypeScript test for:\nURL: ${url}\nFeature: ${feature}\n\nCRITICAL REQUIREMENTS:\n- Self-contained single file — NO Page Object imports, NO external dependencies\n- Use only: import { test, expect } from '@playwright/test';\n- No nullish coalescing operator ?? — use || instead\n- No optional chaining ?. inside template literals — use explicit ternary\n- All logic inline inside the test file\n- For masked/imask inputs use: await page.locator('input[name="iin"]').click({ force: true }) then page.keyboard.type()\n- This is a Vue.js SPA — NEVER use waitForLoadState(). NEVER use page.waitForTimeout() in any form — use expect(locator).toBeVisible({ timeout: N }) instead\n- After page.goto(), wait for a visible element: for cabinet.nomad.kz/login use await page.locator('#iin-input').waitFor({ state: 'visible', timeout: 15000 }). For ANY other URL use: await page.waitForSelector('input:visible', { timeout: 30000 })\n- For cabinet.nomad.kz/login: the visible IIN input is '#iin-input' (type=tel). NEVER use 'input[name="iin"]' — those are hidden in collapsed tabs\n- MASKED INPUT CLEARING: The ONLY reliable way to clear a masked input (IIN, BIN, phone, date) is via evaluate: await input.evaluate((el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }). NEVER use keyboard shortcuts (Ctrl+A+Delete or Ctrl+A+Backspace) — iMask intercepts these events and prevents full clearing\n- For any other URL: DO NOT guess element IDs or names. Use ONLY semantic selectors: getByRole('textbox').first(), getByLabel(), getByPlaceholder(). NEVER create an array of guessed selectors joined with comma like '#bin-input, input[name=bin], input[type=tel]' — this causes false positives on wrong elements\n- For unknown URLs: generate 5-10 conservative tests (Smoke + Functional only), not 20-30\n- Each test() must be fully independent — NO shared helper functions that contain expect() assertions\n- Navigation helper must ONLY do: await page.goto(URL); await page.waitForSelector('input:visible', { timeout: 30000 });\n- ALWAYS use .first() to avoid strict mode violations when multiple elements match\n- Do NOT apply login-page selectors to other pages\n- Write ALL test names and descriptions in Russian (e.g., test('Поле ИИН отображается и пустое при загрузке', ...))\n- Return ONLY the complete TypeScript code wrapped in a \`\`\`typescript block`,
      },
    ],
  });

  return extractText(response);
}

async function generateChecklist(url, feature) {
  const systemPrompt = await loadPrompt('qa-checklist');

  const response = await streamMessage({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Generate a comprehensive QA checklist for:\nURL: ${url || 'not specified'}\nFeature: ${feature}`,
      },
    ],
  });

  return extractText(response);
}

async function investigateBug(failureLog) {
  const systemPrompt = await loadPrompt('bug-investigator');

  const response = await streamMessage({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Проанализируй падение теста и дай краткий ответ на русском языке:\n- Что упало (название теста)\n- Причина (1-2 предложения, без стек трейсов)\n- Как исправить (1 предложение)\n\nМаксимум 5 предложений. Без технических деталей и стек трейсов.\n\n${failureLog}`,
      },
    ],
  });

  return extractText(response);
}

async function generateReport(testResults) {
  const systemPrompt = await loadPrompt('qa-reporter');

  const response = await streamMessage({
    model: MODEL,
    max_tokens: 3000,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Analyze these Playwright test results and generate a QA report:\n\n${testResults}`,
      },
    ],
  });

  return extractText(response);
}

function extractText(response) {
  const textBlocks = response.content.filter((b) => b.type === 'text');
  return textBlocks.map((b) => b.text).join('\n');
}

module.exports = { generateTest, generateChecklist, investigateBug, generateReport };
