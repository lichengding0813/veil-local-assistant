const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { buildModelMessages, SYSTEM_PROMPT } = require('./src/system-prompt.cjs');
const { analyzeStreamPacket } = require('./src/ollama-progress.cjs');
const { buildChatRequest } = require('./src/ollama-request.cjs');
const {
  PROVIDER_PRESETS,
  knownProvider,
  validateEndpoint,
  ollamaEndpoint,
  openAIChatEndpoint,
  buildOpenAIChatRequest,
  parseOpenAIStreamLine
} = require('./src/provider-runtime.cjs');

const activeRequests = new Map();
let mainWindow = null;
let windowPreferences = {
  alwaysOnTop: false,
  transparent: false,
  contentProtection: true
};

function jsonFile(name) {
  return path.join(app.getPath('userData'), name);
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function loadWindowPreferences() {
  const saved = readJsonFile(jsonFile('window-preferences.json'), {});
  windowPreferences = {
    alwaysOnTop: saved.alwaysOnTop === true,
    transparent: saved.transparent === true,
    contentProtection: saved.contentProtection !== false
  };
}

function saveWindowPreferences() {
  writeJsonFile(jsonFile('window-preferences.json'), windowPreferences);
}

function applyWindowPreferences(window) {
  if (!window || window.isDestroyed()) return;
  window.setContentProtection(windowPreferences.contentProtection);
  window.setAlwaysOnTop(windowPreferences.alwaysOnTop, 'floating');
  window.setBackgroundColor(windowPreferences.transparent ? '#00000000' : '#1e1e1e');
  if (process.platform === 'darwin') {
    window.setWindowButtonVisibility(!windowPreferences.transparent);
    window.setVisibleOnAllWorkspaces(windowPreferences.alwaysOnTop, { visibleOnFullScreen: true });
  }
}

function secretDocument() {
  return readJsonFile(jsonFile('provider-secrets.json'), { version: 1, keys: {} });
}

function readProviderApiKey(provider) {
  const entry = secretDocument().keys?.[knownProvider(provider)];
  if (!entry?.value) return '';
  try {
    if (entry.encrypted) return safeStorage.decryptString(Buffer.from(entry.value, 'base64'));
    return String(entry.value);
  } catch {
    return '';
  }
}

function saveProviderApiKey(provider, apiKey, clear = false) {
  const selectedProvider = knownProvider(provider);
  if (selectedProvider === 'ollama') return { ok: true, hasApiKey: false, encrypted: true };

  const document = secretDocument();
  document.keys = document.keys || {};
  if (clear) {
    delete document.keys[selectedProvider];
  } else if (typeof apiKey === 'string' && apiKey.trim()) {
    const cleanKey = apiKey.trim();
    if (safeStorage.isEncryptionAvailable()) {
      document.keys[selectedProvider] = {
        encrypted: true,
        value: safeStorage.encryptString(cleanKey).toString('base64')
      };
    } else {
      document.keys[selectedProvider] = { encrypted: false, value: cleanKey };
    }
  }
  writeJsonFile(jsonFile('provider-secrets.json'), document);
  const stored = document.keys[selectedProvider];
  return {
    ok: true,
    hasApiKey: Boolean(stored?.value),
    encrypted: stored ? stored.encrypted === true : safeStorage.isEncryptionAvailable()
  };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 420,
    minHeight: 360,
    show: false,
    transparent: true,
    title: 'Veil 本地对话',
    backgroundColor: windowPreferences.transparent ? '#00000000' : '#1e1e1e',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true
    }
  });

  applyWindowPreferences(window);
  window.loadFile(path.join(__dirname, 'src', 'index.html'));
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  return window;
}

function requestKey(senderId, requestId) {
  return `${senderId}:${requestId}`;
}

function transportFor(url) {
  return url.protocol === 'https:' ? https : http;
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = transportFor(url).request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 5000
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(errorMessage(body, response.statusCode)));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('模型服务返回了无法识别的数据'));
        }
      });
    });

    request.on('timeout', () => request.destroy(new Error('连接模型服务超时')));
    request.on('error', reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function errorMessage(rawBody, statusCode) {
  try {
    const parsed = JSON.parse(rawBody);
    return parsed?.error?.message || parsed?.error || parsed?.message || `模型服务返回 ${statusCode}`;
  } catch {
    return String(rawBody || '').trim().slice(0, 500) || `模型服务返回 ${statusCode}`;
  }
}

function metricsFromOpenAI(state) {
  const evalCount = state.completionTokens || 0;
  const startedAt = state.firstTokenAt || state.startedAt;
  const evalDuration = Math.max(0, Date.now() - startedAt) * 1e6;
  return evalCount > 0 ? {
    evalCount,
    evalDuration,
    promptEvalCount: 0,
    promptEvalDuration: 0,
    loadDuration: 0,
    totalDuration: Math.max(0, Date.now() - state.startedAt) * 1e6,
    tokensPerSecond: evalDuration > 0 ? evalCount / (evalDuration / 1e9) : 0
  } : null;
}

function streamOllama({ endpoint, model, messages, think, requestId, sender }) {
  return new Promise((resolve, reject) => {
    const key = requestKey(sender.id, requestId);
    const state = { request: null, stopped: false, metrics: null };
    activeRequests.set(key, state);

    const body = JSON.stringify(buildChatRequest({ model, messages, think }));
    const url = ollamaEndpoint(endpoint, '/api/chat');
    const request = http.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      },
      timeout: 120000
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        let errorBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { errorBody += chunk; });
        response.on('end', () => reject(new Error(errorMessage(errorBody, response.statusCode))));
        return;
      }

      if (!sender.isDestroyed()) sender.send('chat:progress', { requestId, phase: 'processing' });
      response.setEncoding('utf8');
      let pending = '';

      response.on('data', (chunk) => {
        pending += chunk;
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const progress = analyzeStreamPacket(JSON.parse(line));
            if (progress.metrics) state.metrics = progress.metrics;
            if (sender.isDestroyed()) continue;
            if (progress.thinkingCharacters > 0) {
              sender.send('chat:progress', { requestId, phase: 'thinking', characters: progress.thinkingCharacters });
            }
            if (progress.contentCharacters > 0) {
              sender.send('chat:progress', { requestId, phase: 'answering', characters: progress.contentCharacters });
              sender.send('chat:chunk', { requestId, content: progress.content });
            }
          } catch {
            // Ignore a malformed packet while keeping the remaining stream alive.
          }
        }
      });

      response.on('end', () => resolve({ stopped: state.stopped, metrics: state.metrics }));
      response.on('error', reject);
    });

    state.request = request;
    attachRequestErrors(request, state, resolve, reject);
    request.write(body);
    request.end();
  });
}

function streamOpenAI({ provider, endpoint, apiKey, model, messages, think, requestId, sender }) {
  return new Promise((resolve, reject) => {
    const key = requestKey(sender.id, requestId);
    const state = {
      request: null,
      stopped: false,
      startedAt: Date.now(),
      firstTokenAt: 0,
      completionTokens: 0
    };
    activeRequests.set(key, state);

    const body = JSON.stringify(buildOpenAIChatRequest({ provider, model, messages, think }));
    const url = openAIChatEndpoint(endpoint);
    const request = transportFor(url).request(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body)
      },
      timeout: 120000
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        let errorBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { errorBody += chunk; });
        response.on('end', () => reject(new Error(errorMessage(errorBody, response.statusCode))));
        return;
      }

      if (!sender.isDestroyed()) sender.send('chat:progress', { requestId, phase: 'processing' });
      response.setEncoding('utf8');
      let pending = '';

      response.on('data', (chunk) => {
        pending += chunk.replace(/\r/g, '');
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        for (const line of lines) {
          let packet;
          try {
            packet = parseOpenAIStreamLine(line);
          } catch {
            continue;
          }
          if (!packet) continue;
          if (packet.usage?.completionTokens) state.completionTokens = packet.usage.completionTokens;
          if (sender.isDestroyed()) continue;
          if (packet.reasoningCharacters > 0) {
            if (!state.firstTokenAt) state.firstTokenAt = Date.now();
            sender.send('chat:progress', { requestId, phase: 'thinking', characters: packet.reasoningCharacters });
          }
          if (packet.content) {
            if (!state.firstTokenAt) state.firstTokenAt = Date.now();
            sender.send('chat:progress', { requestId, phase: 'answering', characters: Array.from(packet.content).length });
            sender.send('chat:chunk', { requestId, content: packet.content });
          }
        }
      });

      response.on('end', () => resolve({ stopped: state.stopped, metrics: metricsFromOpenAI(state) }));
      response.on('error', reject);
    });

    state.request = request;
    attachRequestErrors(request, state, resolve, reject);
    request.write(body);
    request.end();
  });
}

function attachRequestErrors(request, state, resolve, reject) {
  request.on('timeout', () => request.destroy(new Error('模型生成超时')));
  request.on('error', (error) => {
    if (state.stopped) resolve({ stopped: true });
    else reject(error);
  });
  request.on('close', () => {
    if (state.stopped) resolve({ stopped: true });
  });
}

function publicAppState() {
  return {
    contentProtection: windowPreferences.contentProtection,
    alwaysOnTop: windowPreferences.alwaysOnTop,
    transparent: windowPreferences.transparent,
    electronVersion: process.versions.electron,
    defaultSystemPrompt: SYSTEM_PROMPT
  };
}

function registerIpc() {
  ipcMain.handle('app:state', () => publicAppState());

  ipcMain.handle('app:set-preferences', (_event, preferences) => {
    for (const key of ['alwaysOnTop', 'transparent', 'contentProtection']) {
      if (typeof preferences?.[key] === 'boolean') windowPreferences[key] = preferences[key];
    }
    saveWindowPreferences();
    applyWindowPreferences(mainWindow);
    return { ok: true, ...publicAppState() };
  });

  ipcMain.handle('provider:secret-state', (_event, config) => {
    const provider = knownProvider(config?.provider);
    return {
      ok: true,
      hasApiKey: Boolean(readProviderApiKey(provider)),
      encrypted: safeStorage.isEncryptionAvailable()
    };
  });

  ipcMain.handle('provider:save-secret', (_event, config) => {
    return saveProviderApiKey(config?.provider, config?.apiKey, config?.clear === true);
  });

  ipcMain.handle('provider:check', async (_event, config) => {
    const provider = knownProvider(config?.provider);
    try {
      if (provider === 'ollama') {
        const data = await requestJson(ollamaEndpoint(config.endpoint, '/api/tags'));
        const models = Array.isArray(data.models)
          ? data.models.map((entry) => entry.name).filter(Boolean)
          : [];
        return { ok: true, models, statusLabel: '本地已连接', remote: false };
      }

      validateEndpoint(config.endpoint);
      if (!config.model?.trim()) throw new Error('请填写 API 模型名称');
      if (!readProviderApiKey(provider)) throw new Error('请先在设置中保存 API Key');
      return {
        ok: true,
        models: [config.model.trim()],
        statusLabel: `${PROVIDER_PRESETS[provider].label.replace('API · ', '')} 已配置`,
        remote: true
      };
    } catch (error) {
      return { ok: false, error: error.message, models: [] };
    }
  });

  ipcMain.handle('model:inspect', async (_event, config) => {
    if (!config?.model) return { ok: false, error: '未选择模型', capabilities: [] };
    try {
      const body = JSON.stringify({ model: config.model, verbose: false });
      const data = await requestJson(ollamaEndpoint(config.endpoint, '/api/show'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body)
        },
        body
      });
      const capabilities = Array.isArray(data.capabilities)
        ? data.capabilities.filter((item) => typeof item === 'string')
        : [];
      return { ok: true, capabilities };
    } catch (error) {
      return { ok: false, error: error.message, capabilities: [] };
    }
  });

  ipcMain.handle('chat:generate', async (event, payload) => {
    const { endpoint, model, messages, requestId } = payload || {};
    const provider = knownProvider(payload?.provider);
    const think = payload?.think === true;
    if (!requestId || !model || !Array.isArray(messages)) {
      return { ok: false, error: '生成请求不完整' };
    }

    try {
      const modelMessages = buildModelMessages(messages, payload?.systemPrompt);
      let result;
      if (provider === 'ollama') {
        result = await streamOllama({ endpoint, model, messages: modelMessages, think, requestId, sender: event.sender });
      } else {
        const apiKey = readProviderApiKey(provider);
        if (!apiKey) throw new Error('API Key 未配置');
        result = await streamOpenAI({
          provider,
          endpoint,
          apiKey,
          model,
          messages: modelMessages,
          think,
          requestId,
          sender: event.sender
        });
      }
      if (!event.sender.isDestroyed()) {
        event.sender.send('chat:done', { requestId, stopped: result.stopped, metrics: result.metrics });
      }
      return { ok: true, stopped: result.stopped, metrics: result.metrics };
    } catch (error) {
      if (!event.sender.isDestroyed()) event.sender.send('chat:error', { requestId, error: error.message });
      return { ok: false, error: error.message };
    } finally {
      activeRequests.delete(requestKey(event.sender.id, requestId));
    }
  });

  ipcMain.handle('chat:stop', (event, requestId) => {
    const state = activeRequests.get(requestKey(event.sender.id, requestId));
    if (!state) return { ok: false };
    state.stopped = true;
    state.request?.destroy(new Error('已停止生成'));
    return { ok: true };
  });

  ipcMain.handle('shell:open-external', async (_event, rawUrl) => {
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return { ok: false };
    }
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false };
    await shell.openExternal(url.toString());
    return { ok: true };
  });
}

app.on('browser-window-created', (_event, window) => applyWindowPreferences(window));

app.whenReady().then(() => {
  loadWindowPreferences();
  registerIpc();
  mainWindow = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('before-quit', () => {
  for (const state of activeRequests.values()) {
    state.stopped = true;
    state.request?.destroy();
  }
  activeRequests.clear();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { validateEndpoint, ollamaEndpoint, openAIChatEndpoint };
