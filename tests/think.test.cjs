const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildChatRequest } = require('../src/ollama-request.cjs');

test('sends an explicit boolean think setting to Ollama', () => {
  const base = { model: 'qwen3.5:9b', messages: [] };
  assert.equal(buildChatRequest({ ...base, think: true }).think, true);
  assert.equal(buildChatRequest({ ...base, think: false }).think, false);
  assert.equal(buildChatRequest({ ...base, think: 'true' }).think, false);
});

test('exposes an accessible persisted thinking toggle', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8');
  assert.match(html, /id="think-toggle"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(renderer, /think:\s*saved(?:\.|\?\.)think === true/);
  assert.match(renderer, /capabilities\.includes\('thinking'\)/);
});
