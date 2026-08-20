const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  importItems,
  normalizeItem,
  retrieve,
  status
} = require('../src/knowledge-base.cjs');

test('stores a private question bank in SQLite and performs hybrid retrieval', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'veil-knowledge-test-'));
  const database = path.join(directory, 'knowledge.sqlite3');
  const items = [
    normalizeItem({ 题目: 'JavaScript 中 const 的作用？', 答案: '声明块级常量', 科目: '编程' }, 0, 'test'),
    normalizeItem({ question: 'Python 如何输出 Hello？', answer: 'print("Hello")', subject: '编程' }, 1, 'test')
  ];
  await importItems(database, items, async (texts) => texts.map((_, index) => index ? [0, 1] : [1, 0]));

  assert.deepEqual(await status(database), {
    count: 2,
    embedded: 2,
    updatedAt: (await status(database)).updatedAt
  });
  const results = await retrieve(database, 'const 常量', [1, 0], 1);
  assert.equal(results.length, 1);
  assert.match(results[0].question, /const/);
});
