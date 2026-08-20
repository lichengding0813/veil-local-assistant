const test = require('node:test');
const assert = require('node:assert/strict');
const markdown = require('../src/markdown.js');

test('renders headings, lists and fenced code blocks', () => {
  const result = markdown.render('# 标题\n\n- 一\n- 二\n\n```js\nconst x = 1;\n```');
  assert.match(result, /<h1>标题<\/h1>/);
  assert.match(result, /<ul><li>一<\/li><li>二<\/li><\/ul>/);
  assert.match(result, /class="code-block"/);
  assert.match(result, /const x = 1;/);
});

test('escapes raw html and unsafe attributes', () => {
  const result = markdown.render('<img src=x onerror=alert(1)>');
  assert.doesNotMatch(result, /<img/);
  assert.match(result, /&lt;img/);
});

test('only linkifies http and https markdown links', () => {
  const safe = markdown.render('[OpenAI](https://openai.com)');
  const unsafe = markdown.render('[bad](javascript:alert(1))');
  assert.match(safe, /<a href="https:\/\/openai.com\//);
  assert.doesNotMatch(unsafe, /<a href=/);
});

test('renders markdown tables', () => {
  const result = markdown.render('| A | B |\n| --- | --- |\n| 1 | 2 |');
  assert.match(result, /<table>/);
  assert.match(result, /<th>A<\/th>/);
  assert.match(result, /<td>2<\/td>/);
});
