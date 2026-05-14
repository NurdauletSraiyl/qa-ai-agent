const { Telegraf } = require('telegraf');
const fs = require('fs-extra');
const { exec } = require('child_process');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);

// 🧠 simple generator
function generatePlaywrightTest(url, feature) {
  return `
const { test, expect } = require('@playwright/test');

test('${feature}', async ({ page }) => {
  await page.goto('${url}');

  const input = page.getByRole('textbox');

  await expect(input).toBeVisible();

  await input.fill('123456789012');

  await expect(input).toHaveValue('123456789012');
});
`;
}

async function saveTest(code, name) {
  const path = `tests/ui/${name}.spec.ts`;
  await fs.ensureDir('tests/ui');
  await fs.writeFile(path, code);
  return path;
}

function runTests() {
  return new Promise((resolve) => {
    exec('npx playwright test --reporter=list', (err, stdout) => {
      if (err) return resolve(err.message);
      resolve(stdout);
    });
  });
}

bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  if (!text.startsWith('test')) {
    return ctx.reply('Use: test <url> <feature>');
  }

  const parts = text.split(' ');
  const url = parts[1];
  const feature = parts.slice(2).join(' ') || 'auto test';

  await ctx.reply('🧠 Generating test...');

  const code = generatePlaywrightTest(url, feature);
  const fileName = feature.replace(/\s+/g, '_');

  const filePath = await saveTest(code, fileName);

  await ctx.reply(`📁 Created: ${filePath}`);

  await ctx.reply('🚀 Running tests...');

  const result = await runTests();

  await ctx.reply(`📊 Result:\n\n${result}`);
});

bot.launch();

console.log('🤖 QA Bot running...');