const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEndpoint,
  openAIChatEndpoint,
  buildOpenAIChatRequest,
  parseOpenAIStreamLine
} = require('../src/provider-runtime.cjs');

test('allows HTTPS APIs and only loopback HTTP APIs', () => {
  assert.equal(validateEndpoint('https://api.deepseek.com').hostname, 'api.deepseek.com');
  assert.equal(validateEndpoint('http://127.0.0.1:8080/v1').port, '8080');
  assert.throws(() => validateEndpoint('http://example.com/v1'), /必须使用 HTTPS/);
  assert.throws(() => validateEndpoint('https://example.com', { localOnly: true }), /Ollama/);
});

test('builds compatible Gemini and DeepSeek requests', () => {
  const messages = [{ role: 'user', content: 'hello' }];
  const gemini = buildOpenAIChatRequest({ provider: 'gemini', model: 'gemini-test', messages, think: false });
  const deepseek = buildOpenAIChatRequest({ provider: 'deepseek', model: 'deepseek-test', messages, think: true });
  assert.equal(gemini.reasoning_effort, 'low');
  assert.deepEqual(deepseek.thinking, { type: 'enabled' });
  assert.equal(openAIChatEndpoint('https://api.deepseek.com').pathname, '/chat/completions');
  assert.equal(openAIChatEndpoint('https://example.com/v1/chat/completions').pathname, '/v1/chat/completions');
});

test('parses streamed answer and reasoning without returning reasoning text', () => {
  const parsed = parseOpenAIStreamLine('data: {"choices":[{"delta":{"reasoning_content":"先想想","content":"答"}}]}');
  assert.equal(parsed.content, '答');
  assert.equal(parsed.reasoningCharacters, 3);
  assert.equal('reasoning' in parsed, false);
  assert.equal(parseOpenAIStreamLine('data: [DONE]').done, true);
});
