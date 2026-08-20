const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

test('locks the application grid to the viewport', () => {
  assert.match(css, /\.app-shell\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.app-shell\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.main-panel\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
});

test('keeps message and code scrolling in their own regions', () => {
  assert.match(css, /\.messages\s*\{[^}]*min-height:\s*0[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.code-block pre\s*\{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto/s);
});

test('supports a compact quarter-screen window', () => {
  assert.match(main, /minWidth:\s*420/);
  assert.match(main, /minHeight:\s*360/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.sidebar\s*\{\s*display:\s*none;/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.compact-new-chat-button\s*\{[^}]*display:\s*grid;/);
  assert.match(html, /id="compact-new-chat-button"[^>]*aria-label="新建对话"/);
});

test('shows non-deceptive generation progress', () => {
  assert.match(html, /id="generation-progress"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="generation-stage"/);
  assert.match(html, /id="generation-elapsed"/);
  assert.match(css, /\.generation-progress\s*\{[^}]*grid-template-columns:[^}]*minmax\(0,\s*1fr\)/s);
});
