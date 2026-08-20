const { characterCount } = require('./ollama-progress.cjs');

const PROVIDER_PRESETS = Object.freeze({
  ollama: {
    label: '本地 · Ollama',
    endpoint: 'http://127.0.0.1:11434',
    model: ''
  },
  gemini: {
    label: 'API · Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.7-flash'
  },
  deepseek: {
    label: 'API · DeepSeek',
    endpoint: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash'
  },
  openai: {
    label: 'API · OpenAI 兼容',
    endpoint: 'https://api.openai.com/v1',
    model: ''
  }
});

function knownProvider(value) {
  return Object.hasOwn(PROVIDER_PRESETS, value) ? value : 'ollama';
}

function validateEndpoint(rawEndpoint, { localOnly = false } = {}) {
  let endpoint;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    throw new Error('模型地址格式不正确');
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  const isLoopback = loopbackHosts.has(endpoint.hostname);
  if (localOnly && (endpoint.protocol !== 'http:' || !isLoopback)) {
    throw new Error('Ollama 只允许连接本机 HTTP 服务');
  }
  if (!localOnly && endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLoopback)) {
    throw new Error('远程 API 必须使用 HTTPS；本机兼容服务可以使用 HTTP');
  }
  if (endpoint.username || endpoint.password) {
    throw new Error('模型地址不能包含账号或密码');
  }

  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');
  endpoint.search = '';
  endpoint.hash = '';
  return endpoint;
}

function appendEndpointPath(endpoint, pathname) {
  const current = endpoint.pathname.replace(/\/+$/, '');
  endpoint.pathname = `${current}/${pathname.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  return endpoint;
}

function ollamaEndpoint(rawEndpoint, pathname) {
  return appendEndpointPath(validateEndpoint(rawEndpoint, { localOnly: true }), pathname);
}

function openAIChatEndpoint(rawEndpoint) {
  const endpoint = validateEndpoint(rawEndpoint);
  if (!endpoint.pathname.endsWith('/chat/completions')) {
    appendEndpointPath(endpoint, 'chat/completions');
  }
  return endpoint;
}

function buildOpenAIChatRequest({ provider, model, messages, think }) {
  const selectedProvider = knownProvider(provider);
  const body = {
    model,
    messages,
    stream: true
  };

  if (selectedProvider === 'gemini') {
    body.reasoning_effort = think === true ? 'high' : 'low';
    body.stream_options = { include_usage: true };
  } else if (selectedProvider === 'deepseek') {
    body.thinking = { type: think === true ? 'enabled' : 'disabled' };
    body.stream_options = { include_usage: true };
  }

  return body;
}

function parseOpenAIStreamLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith(':')) return null;
  const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
  if (!data) return null;
  if (data === '[DONE]') return { done: true, content: '', reasoningCharacters: 0, usage: null };

  const packet = JSON.parse(data);
  const choice = packet?.choices?.[0] || {};
  const delta = choice.delta || {};
  const content = typeof delta.content === 'string' ? delta.content : '';
  const reasoning = [delta.reasoning_content, delta.thinking, delta.thought_summary]
    .find((value) => typeof value === 'string') || '';
  const completionTokens = Number.isFinite(packet?.usage?.completion_tokens)
    ? packet.usage.completion_tokens
    : 0;

  return {
    done: choice.finish_reason != null,
    content,
    reasoningCharacters: characterCount(reasoning),
    usage: completionTokens > 0 ? { completionTokens } : null
  };
}

module.exports = {
  PROVIDER_PRESETS,
  knownProvider,
  validateEndpoint,
  ollamaEndpoint,
  openAIChatEndpoint,
  buildOpenAIChatRequest,
  parseOpenAIStreamLine
};
