'use strict';

const fs = require('fs-extra');
const path = require('path');

const PROMPTS_DIR = path.join(__dirname, '../../prompts');
const cache = new Map();

async function loadPrompt(name) {
  if (cache.has(name)) return cache.get(name);
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  const content = await fs.readFile(filePath, 'utf-8');
  cache.set(name, content);
  return content;
}

function clearCache() {
  cache.clear();
}

module.exports = { loadPrompt, clearCache };
