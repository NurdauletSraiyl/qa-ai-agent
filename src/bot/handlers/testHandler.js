'use strict';

const { generateTest, investigateBug } = require('../../ai/client');
const { saveTest, runTests, validateUrl, extractCodeBlock } = require('../../runner/testRunner');
const { formatTestResult, splitIntoChunks } = require('../../reporter/formatter');

async function handleTest(ctx, args) {
  if (args.length < 2) {
    return ctx.reply(
      'Usage: `test <url> <feature description>`\n\nExample:\n`test https://site.com login form`',
      { parse_mode: 'Markdown' }
    );
  }

  const [url, ...featureParts] = args;
  const feature = featureParts.join(' ');

  if (!validateUrl(url)) {
    return ctx.reply('⚠️ Invalid URL. Must start with http:// or https://');
  }

  const statusMsg = await ctx.reply('🧠 AI is generating Playwright test...');

  try {
    const aiResponse = await generateTest(url, feature);
    const code = extractCodeBlock(aiResponse);
    const { filePath } = await saveTest(code, feature);

    await ctx.reply(`📁 Test created: \`${filePath}\``, { parse_mode: 'Markdown' });
    await ctx.reply('🚀 Running test...');

    const { success, output } = await runTests(filePath);
    const report = formatTestResult(output, success);

    await ctx.reply(report, { parse_mode: 'Markdown' });

    if (!success) {
      await ctx.reply('🔍 AI is investigating the failure...');
      const analysis = await investigateBug(output);
      const chunks = splitIntoChunks(`📊 *Bug Analysis*\n\n${analysis}`);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' });
      }
    }
  } catch (err) {
    console.error('[testHandler] error:', err.message);
    await ctx.reply(`❌ Error: ${err.message}`);
  }
}

module.exports = { handleTest };
