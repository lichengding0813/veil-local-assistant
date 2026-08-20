const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeStreamPacket, characterCount } = require('../src/ollama-progress.cjs');

test('counts streamed thinking without exposing its content', () => {
  const progress = analyzeStreamPacket({
    message: { thinking: '先分析一下🙂', content: '' },
    done: false
  });

  assert.equal(progress.thinkingCharacters, 6);
  assert.equal(progress.content, '');
  assert.equal('thinking' in progress, false);
  assert.equal(characterCount('🙂'), 1);
});

test('reports answer characters and final generation speed', () => {
  const progress = analyzeStreamPacket({
    message: { content: '完成' },
    done: true,
    eval_count: 240,
    eval_duration: 20_000_000_000,
    prompt_eval_count: 128,
    prompt_eval_duration: 2_000_000_000,
    load_duration: 1_000_000_000,
    total_duration: 23_000_000_000
  });

  assert.equal(progress.contentCharacters, 2);
  assert.equal(progress.metrics.evalCount, 240);
  assert.equal(progress.metrics.tokensPerSecond, 12);
});
