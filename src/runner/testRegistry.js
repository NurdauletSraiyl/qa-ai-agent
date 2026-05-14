'use strict';

const fs = require('fs-extra');
const path = require('path');

const TESTS_DIR = process.env.TESTS_DIR || path.resolve(__dirname, '../../tests');
const REGISTRY_PATH = path.join(TESTS_DIR, 'registry.json');

async function loadRegistry() {
  await fs.ensureDir(TESTS_DIR);
  if (!(await fs.pathExists(REGISTRY_PATH))) return {};
  return fs.readJson(REGISTRY_PATH);
}

async function saveRegistry(registry) {
  await fs.writeJson(REGISTRY_PATH, registry, { spaces: 2 });
}

function nextId(registry) {
  const ids = Object.keys(registry)
    .map((k) => parseInt(k.replace('TC-', ''), 10))
    .filter((n) => !isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return `TC-${String(max + 1).padStart(3, '0')}`;
}

async function registerTest(feature, url, filePath) {
  const registry = await loadRegistry();
  const id = nextId(registry);
  registry[id] = {
    id,
    feature,
    url: url || null,
    file: filePath,
    createdAt: new Date().toISOString(),
  };
  await saveRegistry(registry);
  return id;
}

async function getRegistry() {
  return loadRegistry();
}

module.exports = { registerTest, getRegistry, nextId };
