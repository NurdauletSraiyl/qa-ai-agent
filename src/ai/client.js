'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { loadPrompt } = require('./promptLoader');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-7';

async function generateTest(url, feature) {
  const systemPrompt = await loadPrompt('qa-test-generator');

  const response = await anthropic.messages.create({
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
        content: `Generate a Playwright TypeScript test for:\nURL: ${url}\nFeature: ${feature}\n\nReturn ONLY the complete TypeScript test file code, wrapped in a typescript code block.`,
      },
    ],
  });

  return extractText(response);
}

async function generateChecklist(url, feature) {
  const systemPrompt = await loadPrompt('qa-checklist');

  const response = await anthropic.messages.create({
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

  const response = await anthropic.messages.create({
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
        content: `Analyze this test failure and provide root cause analysis:\n\n${failureLog}`,
      },
    ],
  });

  return extractText(response);
}

async function generateReport(testResults) {
  const systemPrompt = await loadPrompt('qa-reporter');

  const response = await anthropic.messages.create({
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
