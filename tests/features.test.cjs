const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');

test('history can collapse, archive, restore, and delete conversations', () => {
  assert.match(html, /id="history-toggle-button"/);
  assert.match(html, /id="archived-list"/);
  assert.match(renderer, /function archiveConversation\(/);
  assert.match(renderer, /function restoreConversation\(/);
  assert.match(renderer, /function deleteConversation\(/);
  assert.match(renderer, /window\.confirm\(/);
});

test('settings expose local and compatible API providers without exposing saved keys', () => {
  for (const provider of ['ollama', 'gemini', 'deepseek', 'openai']) {
    assert.match(html, new RegExp(`<option value="${provider}">`));
  }
  assert.match(html, /id="api-key-input"[^>]*type="password"/);
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /ipcMain\.handle\('provider:save-secret'/);
});

test('assistant window, capture protection, and system prompt are configurable', () => {
  assert.match(main, /transparent:\s*true/);
  assert.match(main, /setAlwaysOnTop\(/);
  assert.match(main, /setContentProtection\(/);
  assert.match(main, /setWindowButtonVisibility\(!windowPreferences\.transparent\)/);
  assert.match(html, /id="transparent-toggle"/);
  assert.match(html, /id="content-protection-toggle"/);
  assert.match(html, /id="system-prompt-input"/);
  assert.match(renderer, /systemPrompt:\s*config\.systemPrompt/);
});

test('transparent mode is a minimal prompter with keyboard escape', () => {
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(css, /transparent-mode \.topbar,[\s\S]*?display:\s*none !important/);
  assert.match(css, /transparent-mode \.message\.user,[\s\S]*?display:\s*none/);
  assert.match(css, /transparent-mode \.message\.assistant:not\(\.latest-assistant\)/);
  assert.match(css, /transparent-mode \.composer\s*\{[\s\S]*?background:\s*rgba/);
  assert.match(renderer, /event\.key === 'Escape' && appState\.transparent/);
  assert.match(renderer, /event\.shiftKey && event\.key\.toLowerCase\(\) === 'a'/);
});
