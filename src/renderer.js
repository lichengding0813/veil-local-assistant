const STORAGE_KEY = 'veil-local-chat-state-v1';
const CONFIG_KEY = 'veil-local-chat-config-v1';

const PROFILE_DEFAULTS = Object.freeze({
  ollama: { endpoint: 'http://127.0.0.1:11434', model: '', models: [] },
  gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.7-flash', models: ['gemini-3.7-flash'] },
  deepseek: { endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', models: ['deepseek-v4-flash'] },
  openai: { endpoint: 'https://api.openai.com/v1', model: '', models: [] }
});

const PROVIDER_LABELS = Object.freeze({
  ollama: 'Ollama',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  openai: 'API'
});

const elements = {
  conversationList: document.querySelector('#conversation-list'),
  archivedList: document.querySelector('#archived-list'),
  archiveSectionButton: document.querySelector('#archive-section-button'),
  archiveCount: document.querySelector('#archive-count'),
  conversationTitle: document.querySelector('#conversation-title'),
  newChatButton: document.querySelector('#new-chat-button'),
  compactNewChatButton: document.querySelector('#compact-new-chat-button'),
  historyToggleButton: document.querySelector('#history-toggle-button'),
  sidebarScrim: document.querySelector('#sidebar-scrim'),
  messages: document.querySelector('#messages'),
  messageList: document.querySelector('#message-list'),
  emptyState: document.querySelector('#empty-state'),
  input: document.querySelector('#message-input'),
  sendButton: document.querySelector('#send-button'),
  stopButton: document.querySelector('#stop-button'),
  thinkToggle: document.querySelector('#think-toggle'),
  thinkLabel: document.querySelector('#think-label'),
  composer: document.querySelector('#composer'),
  generationProgress: document.querySelector('#generation-progress'),
  generationStage: document.querySelector('#generation-stage'),
  generationDetail: document.querySelector('#generation-detail'),
  generationElapsed: document.querySelector('#generation-elapsed'),
  connectionPill: document.querySelector('#connection-pill'),
  connectionLabel: document.querySelector('#connection-label'),
  modelSelect: document.querySelector('#model-select'),
  refreshButton: document.querySelector('#refresh-button'),
  assistantModeButton: document.querySelector('#assistant-mode-button'),
  protectionButton: document.querySelector('#protection-button'),
  settingsButton: document.querySelector('#settings-button'),
  settingsDialog: document.querySelector('#settings-dialog'),
  settingsForm: document.querySelector('#settings-form'),
  providerSelect: document.querySelector('#provider-select'),
  endpointInput: document.querySelector('#endpoint-input'),
  apiSettings: document.querySelector('#api-settings'),
  apiModelInput: document.querySelector('#api-model-input'),
  apiModelList: document.querySelector('#api-model-list'),
  addApiModelButton: document.querySelector('#add-api-model-button'),
  apiKeyInput: document.querySelector('#api-key-input'),
  apiKeyStatus: document.querySelector('#api-key-status'),
  clearApiKey: document.querySelector('#clear-api-key'),
  transparentToggle: document.querySelector('#transparent-toggle'),
  alwaysOnTopToggle: document.querySelector('#always-on-top-toggle'),
  contentProtectionToggle: document.querySelector('#content-protection-toggle'),
  systemPromptInput: document.querySelector('#system-prompt-input'),
  restoreSystemPromptButton: document.querySelector('#restore-system-prompt-button'),
  clearSystemPromptButton: document.querySelector('#clear-system-prompt-button'),
  assistantShortcutInput: document.querySelector('#assistant-shortcut-input'),
  recordShortcutButton: document.querySelector('#record-shortcut-button'),
  resetShortcutButton: document.querySelector('#reset-shortcut-button'),
  shortcutStatus: document.querySelector('#shortcut-status'),
  knowledgeEnabledToggle: document.querySelector('#knowledge-enabled-toggle'),
  embeddingModelInput: document.querySelector('#embedding-model-input'),
  rerankerEnabledToggle: document.querySelector('#reranker-enabled-toggle'),
  rerankerModelInput: document.querySelector('#reranker-model-input'),
  knowledgeStatus: document.querySelector('#knowledge-status'),
  importKnowledgeButton: document.querySelector('#import-knowledge-button'),
  clearKnowledgeButton: document.querySelector('#clear-knowledge-button'),
  offlineBanner: document.querySelector('#offline-banner'),
  offlineMessage: document.querySelector('#offline-message'),
  offlineSettingsButton: document.querySelector('#offline-settings-button'),
  securityCard: document.querySelector('#security-card'),
  securityCardLabel: document.querySelector('#security-card-label'),
  securityDialog: document.querySelector('#security-dialog'),
  securityDialogTitle: document.querySelector('#security-dialog-title'),
  securityCurrentState: document.querySelector('#security-current-state'),
  securityToggleButton: document.querySelector('#security-toggle-button'),
  electronVersion: document.querySelector('#electron-version'),
  toast: document.querySelector('#toast')
};

function id() {
  return crypto.randomUUID();
}

function createConversation() {
  const now = Date.now();
  return { id: id(), title: '新对话', messages: [], archived: false, createdAt: now, updatedAt: now };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.conversations) && saved.conversations.length) {
      const conversations = saved.conversations.map((conversation) => ({
        ...conversation,
        archived: conversation.archived === true,
        messages: Array.isArray(conversation.messages) ? conversation.messages : []
      }));
      const available = conversations.filter((conversation) => !conversation.archived);
      if (!available.length) available.push(createConversation());
      for (const conversation of available) {
        if (!conversations.includes(conversation)) conversations.push(conversation);
      }
      const activeId = available.some((conversation) => conversation.id === saved.activeId)
        ? saved.activeId
        : available[0].id;
      return { conversations, activeId, generating: null };
    }
  } catch {
    // Start with a clean local state if old data is invalid.
  }
  const conversation = createConversation();
  return { conversations: [conversation], activeId: conversation.id, generating: null };
}

function profileFromSaved(saved, provider) {
  const defaults = PROFILE_DEFAULTS[provider];
  const profile = saved?.profiles?.[provider] || {};
  const savedModels = Array.isArray(profile.models) ? profile.models : [profile.model];
  const models = [...new Set(savedModels.filter((model) => typeof model === 'string' && model.trim()).map((model) => model.trim()))];
  if (!models.length && defaults.models.length) models.push(...defaults.models);
  const selectedModel = typeof profile.model === 'string' && profile.model.trim()
    ? profile.model.trim()
    : (models[0] || defaults.model);
  if (selectedModel && !models.includes(selectedModel)) models.unshift(selectedModel);
  return {
    endpoint: typeof profile.endpoint === 'string' && profile.endpoint ? profile.endpoint : defaults.endpoint,
    model: selectedModel,
    models
  };
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
    const provider = Object.hasOwn(PROFILE_DEFAULTS, saved.provider) ? saved.provider : 'ollama';
    const profiles = {};
    for (const key of Object.keys(PROFILE_DEFAULTS)) profiles[key] = profileFromSaved(saved, key);
    if (!saved.profiles && (saved.endpoint || saved.model)) {
      profiles.ollama = {
        endpoint: saved.endpoint || PROFILE_DEFAULTS.ollama.endpoint,
        model: saved.model || '',
        models: saved.model ? [saved.model] : []
      };
    }
    return {
      provider,
      profiles,
      think: saved.think === true,
      systemPrompt: typeof saved.systemPrompt === 'string' ? saved.systemPrompt : '',
      systemPromptDisabled: saved.systemPromptDisabled === true,
      knowledge: {
        enabled: saved.knowledge?.enabled === true,
        embeddingModel: typeof saved.knowledge?.embeddingModel === 'string' && saved.knowledge.embeddingModel.trim()
          ? saved.knowledge.embeddingModel.trim()
          : 'veil-qwen3-embedding:0.6b-q8',
        rerankerEnabled: saved.knowledge?.rerankerEnabled !== false,
        rerankerModel: typeof saved.knowledge?.rerankerModel === 'string' && saved.knowledge.rerankerModel.trim()
          ? saved.knowledge.rerankerModel.trim()
          : 'veil-qwen3-reranker:0.6b-int8',
        topK: 5
      },
      historyCollapsed: saved.historyCollapsed === true,
      archivesOpen: saved.archivesOpen === true
    };
  } catch {
    return {
      provider: 'ollama',
      profiles: structuredClone(PROFILE_DEFAULTS),
      think: false,
      systemPrompt: '',
      systemPromptDisabled: false,
      knowledge: {
        enabled: false,
        embeddingModel: 'veil-qwen3-embedding:0.6b-q8',
        rerankerEnabled: true,
        rerankerModel: 'veil-qwen3-reranker:0.6b-int8',
        topK: 5
      },
      historyCollapsed: false,
      archivesOpen: false
    };
  }
}

const state = loadState();
const config = loadConfig();
let appState = {
  contentProtection: true,
  alwaysOnTop: false,
  transparent: false,
  electronVersion: '—',
  defaultSystemPrompt: '',
  assistantShortcut: 'Command+Shift+A'
};
let connectionState = 'checking';
let thinkingSupported = null;
let modelInspectionSequence = 0;
let mobileHistoryOpen = false;
let toastTimer;
let progressTimer;
let modelTargets = new Map();
let providerModelDrafts = {};
let recordingShortcut = false;
let shortcutDraft = 'Command+Shift+A';
let systemPromptDisabledDraft = false;

function activeProfile() {
  return config.profiles[config.provider];
}

function activeModelLabel() {
  const profile = activeProfile();
  return profile.model || PROVIDER_LABELS[config.provider];
}

function activeConversation() {
  let conversation = state.conversations.find((item) => item.id === state.activeId && !item.archived);
  if (!conversation) {
    conversation = state.conversations.find((item) => !item.archived) || createConversation();
    if (!state.conversations.includes(conversation)) state.conversations.push(conversation);
    state.activeId = conversation.id;
  }
  return conversation;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    conversations: state.conversations,
    activeId: state.activeId
  }));
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function formatRelativeTime(timestamp) {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60000) return '刚刚';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function showToast(message) {
  if (appState.transparent) return;
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 2400);
}

function formatElapsed(startedAt) {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}分${String(seconds % 60).padStart(2, '0')}秒`;
}

function formatCount(count) {
  return Math.max(0, count || 0).toLocaleString('zh-CN');
}

function updateProgressUI() {
  const progress = state.generating;
  elements.generationProgress.hidden = !progress;
  if (!progress) return;

  let stage = config.provider === 'ollama' ? '正在连接 Ollama' : `正在连接 ${PROVIDER_LABELS[config.provider]} API`;
  let detail = '正在发送请求，模型仍在工作';
  if (progress.phase === 'retrieving') {
    stage = '正在检索本地题库';
    detail = '正在进行关键词与向量混合检索';
  } else if (progress.phase === 'processing') {
    stage = '正在处理上下文';
    detail = progress.thinkEnabled
      ? '深度思考已开启，正在等待首个 token'
      : '快速回答模式，正在等待首个 token';
  } else if (progress.phase === 'thinking') {
    stage = '深度思考中';
    detail = `模型仍在工作 · 已思考 ${formatCount(progress.thinkingCharacters)} 字`;
  } else if (progress.phase === 'answering') {
    stage = '正在回答';
    detail = `已输出 ${formatCount(progress.answerCharacters)} 字`;
    if (progress.thinkingCharacters > 0) detail += ' · 思考完成';
  }

  elements.generationStage.textContent = stage;
  elements.generationDetail.textContent = detail;
  elements.generationElapsed.textContent = formatElapsed(progress.startedAt);
}

function manageProgressTimer(generating) {
  if (generating && !progressTimer) {
    progressTimer = setInterval(updateProgressUI, 1000);
  } else if (!generating && progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function conversationRow(conversation, archived) {
  const row = document.createElement('div');
  row.className = `conversation-row${conversation.id === state.activeId && !archived ? ' active' : ''}`;
  row.dataset.id = conversation.id;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'conversation-item';
  button.dataset.id = conversation.id;
  button.title = archived ? '恢复并打开' : conversation.title;

  const icon = document.createElement('span');
  icon.className = 'conversation-icon';
  icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H9l-4 3V5Z"/></svg>';
  const copy = document.createElement('span');
  copy.className = 'conversation-copy';
  const title = document.createElement('strong');
  title.textContent = conversation.title;
  const time = document.createElement('small');
  time.textContent = formatRelativeTime(conversation.updatedAt);
  copy.append(title, time);
  button.append(icon, copy);

  const actions = document.createElement('span');
  actions.className = 'conversation-actions';
  const archiveButton = document.createElement('button');
  archiveButton.type = 'button';
  archiveButton.className = 'conversation-action';
  archiveButton.dataset.action = archived ? 'restore' : 'archive';
  archiveButton.dataset.id = conversation.id;
  archiveButton.title = archived ? '恢复对话' : '归档对话';
  archiveButton.setAttribute('aria-label', archiveButton.title);
  archiveButton.innerHTML = archived
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4zM3 3h18v4H3zM9 12h6M12 9v6"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4zM3 3h18v4H3zM9 12h6"/></svg>';

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'conversation-action delete';
  deleteButton.dataset.action = 'delete';
  deleteButton.dataset.id = conversation.id;
  deleteButton.title = '删除对话';
  deleteButton.setAttribute('aria-label', '删除对话');
  deleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>';
  actions.append(archiveButton, deleteButton);
  row.append(button, actions);
  return row;
}

function renderSidebar() {
  const sorted = [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const active = sorted.filter((conversation) => !conversation.archived);
  const archived = sorted.filter((conversation) => conversation.archived);
  elements.conversationList.replaceChildren(...active.map((conversation) => conversationRow(conversation, false)));
  elements.archivedList.replaceChildren(...archived.map((conversation) => conversationRow(conversation, true)));
  elements.archiveCount.textContent = String(archived.length);
  elements.archiveSectionButton.setAttribute('aria-expanded', String(config.archivesOpen));
  elements.archivedList.hidden = !config.archivesOpen || archived.length === 0;
  updateHistoryUI();
}

function renderMessages(keepScroll = false) {
  const conversation = activeConversation();
  const latestAssistantId = [...conversation.messages].reverse()
    .find((message) => message.role === 'assistant')?.id;
  elements.conversationTitle.textContent = conversation.title;
  elements.emptyState.hidden = conversation.messages.length > 0;
  elements.messageList.replaceChildren();

  for (const message of conversation.messages) {
    const article = document.createElement('article');
    article.className = `message ${message.role}`;
    if (message.id === latestAssistantId) article.classList.add('latest-assistant');
    article.dataset.messageId = message.id;
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = message.role === 'assistant'
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.4 8.4-8 9.7C7.4 20.4 4 17 4 12V6l8-3Z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';

    const body = document.createElement('div');
    body.className = 'message-body';
    const author = document.createElement('div');
    author.className = 'message-author';
    author.textContent = message.role === 'assistant' ? (message.model || activeModelLabel()) : '你';
    const content = document.createElement('div');
    content.className = 'markdown-body';
    if (!message.content && state.generating?.assistantId === message.id) {
      content.innerHTML = '<div class="thinking"><span></span><span></span><span></span></div>';
    } else {
      content.innerHTML = window.MarkdownRenderer.render(message.content);
    }
    body.append(author, content);
    article.append(avatar, body);
    elements.messageList.append(article);
  }
  if (!keepScroll) requestAnimationFrame(() => { elements.messages.scrollTop = elements.messages.scrollHeight; });
}

function renderAll() {
  renderSidebar();
  renderMessages();
  updateGeneratingUI();
}

function updateGeneratingUI() {
  const generating = Boolean(state.generating);
  elements.stopButton.hidden = !generating;
  elements.sendButton.hidden = generating;
  elements.input.disabled = generating;
  elements.composer.classList.toggle('generating', generating);
  manageProgressTimer(generating);
  updateProgressUI();
  updateThinkUI();
  updateSendButton();
}

function updateSendButton() {
  elements.sendButton.disabled = !elements.input.value.trim() || Boolean(state.generating);
}

function updateHistoryUI() {
  const compact = window.innerWidth <= 760;
  document.body.classList.toggle('history-collapsed', !compact && config.historyCollapsed);
  document.body.classList.toggle('history-open', compact && mobileHistoryOpen);
  elements.sidebarScrim.hidden = !(compact && mobileHistoryOpen);
  elements.historyToggleButton.setAttribute('aria-pressed', String(compact ? mobileHistoryOpen : !config.historyCollapsed));
}

function toggleHistory() {
  if (window.innerWidth <= 760) {
    mobileHistoryOpen = !mobileHistoryOpen;
  } else {
    config.historyCollapsed = !config.historyCollapsed;
    persist();
  }
  updateHistoryUI();
}

function closeMobileHistory() {
  mobileHistoryOpen = false;
  updateHistoryUI();
}

function updateConnectionUI(status, label) {
  connectionState = status;
  elements.connectionPill.className = `connection-pill ${status}`;
  elements.connectionLabel.textContent = label;
  elements.refreshButton.classList.toggle('spinning', status === 'checking');
}

async function refreshConnection({ quiet = false } = {}) {
  updateConnectionUI('checking', '正在检测');
  const checks = await Promise.all(Object.keys(PROFILE_DEFAULTS).map(async (provider) => {
    const profile = config.profiles[provider];
    if (provider !== 'ollama' && !profile.models.length) {
      return { provider, ok: false, models: [], error: '未添加模型' };
    }
    const result = await window.localLLM.checkConnection({
      provider,
      endpoint: profile.endpoint,
      model: profile.model || profile.models[0] || ''
    });
    return { provider, ...result };
  }));

  modelTargets = new Map();
  elements.modelSelect.replaceChildren();
  for (const result of checks) {
    if (!result.ok) continue;
    const profile = config.profiles[result.provider];
    const models = result.provider === 'ollama'
      ? result.models.filter((model) => !/(^|[-_:])(embed(ding)?|rerank(er)?)([-_:]|$)/i.test(model))
      : profile.models;
    if (result.provider === 'ollama') profile.models = result.models;
    if (!models.length) continue;
    const group = document.createElement('optgroup');
    group.label = result.provider === 'ollama'
      ? '本地 · Ollama'
      : `在线 · ${PROVIDER_LABELS[result.provider]}`;
    for (const model of models) {
      const key = `${result.provider}\u0000${model}`;
      const option = document.createElement('option');
      option.value = key;
      option.textContent = model;
      group.append(option);
      modelTargets.set(key, { provider: result.provider, model });
    }
    elements.modelSelect.append(group);
  }

  if (!modelTargets.size) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '无可用模型';
    elements.modelSelect.append(option);
    updateConnectionUI('offline', '未连接');
    const errors = checks.map((result) => result.error).filter(Boolean);
    elements.offlineBanner.hidden = false;
    elements.offlineMessage.textContent = errors[0] || '没有可用的本地或在线模型';
    thinkingSupported = false;
    updateThinkUI();
    if (!quiet) showToast(elements.offlineMessage.textContent);
    return false;
  } else {
    let selectedKey = `${config.provider}\u0000${activeProfile().model}`;
    if (!modelTargets.has(selectedKey)) selectedKey = modelTargets.keys().next().value;
    const selected = modelTargets.get(selectedKey);
    config.provider = selected.provider;
    activeProfile().model = selected.model;
    elements.modelSelect.value = selectedKey;
  }
  updateConnectionUI('online', `已连接 · ${modelTargets.size} 个模型`);
  elements.offlineBanner.hidden = true;
  persist();
  renderMessages(true);
  await refreshThinkingCapability();
  if (!quiet) showToast(`可快捷切换 ${modelTargets.size} 个本地或在线模型`);
  return true;
}

function updateThinkUI() {
  const profile = activeProfile();
  const checking = thinkingSupported === null && Boolean(profile.model);
  const supported = thinkingSupported === true;
  elements.thinkToggle.disabled = Boolean(state.generating) || checking || !supported;
  elements.thinkToggle.setAttribute('aria-checked', String(supported && config.think));
  elements.thinkToggle.classList.toggle('active', supported && config.think);

  if (!profile.model) {
    elements.thinkLabel.textContent = '未选择模型';
    elements.thinkToggle.title = '请先选择模型';
  } else if (checking) {
    elements.thinkLabel.textContent = '检测思考能力';
    elements.thinkToggle.title = '正在读取模型能力';
  } else if (!supported) {
    elements.thinkLabel.textContent = '无独立思考';
    elements.thinkToggle.title = '当前模型或通用 API 未声明独立 thinking 控制';
  } else if (config.think) {
    elements.thinkLabel.textContent = '深度思考';
    elements.thinkToggle.title = '已开启高强度思考；点击切换为快速回答';
  } else {
    elements.thinkLabel.textContent = '快速回答';
    elements.thinkToggle.title = config.provider === 'gemini'
      ? 'Gemini 使用低推理强度；部分模型不能完全关闭推理'
      : 'thinking 已关闭或降至快速模式；点击开启深度思考';
  }
}

async function refreshThinkingCapability() {
  const sequence = ++modelInspectionSequence;
  const profile = activeProfile();
  if (!profile.model) {
    thinkingSupported = false;
    updateThinkUI();
    return;
  }
  if (config.provider === 'gemini' || config.provider === 'deepseek') {
    thinkingSupported = true;
    updateThinkUI();
    return;
  }
  if (config.provider !== 'ollama') {
    thinkingSupported = false;
    config.think = false;
    persist();
    updateThinkUI();
    return;
  }

  thinkingSupported = null;
  updateThinkUI();
  const result = await window.localLLM.inspectModel({ endpoint: profile.endpoint, model: profile.model });
  if (sequence !== modelInspectionSequence) return;
  thinkingSupported = result.ok && result.capabilities.includes('thinking');
  if (!thinkingSupported && config.think) {
    config.think = false;
    persist();
  }
  updateThinkUI();
}

function fallbackConversation(excludedId) {
  const fallback = [...state.conversations]
    .filter((conversation) => !conversation.archived && conversation.id !== excludedId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (fallback) return fallback;
  const conversation = createConversation();
  state.conversations.push(conversation);
  return conversation;
}

function setActiveConversation(conversationId) {
  if (state.generating) {
    showToast('请先停止当前生成');
    return;
  }
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  if (conversation.archived) conversation.archived = false;
  state.activeId = conversationId;
  persist();
  closeMobileHistory();
  renderAll();
  elements.input.focus();
}

function archiveConversation(conversationId) {
  if (state.generating) return showToast('请先停止当前生成');
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  conversation.archived = true;
  if (state.activeId === conversationId) state.activeId = fallbackConversation(conversationId).id;
  persist();
  renderAll();
  showToast('对话已归档');
}

function restoreConversation(conversationId, open = false) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  conversation.archived = false;
  conversation.updatedAt = Date.now();
  if (open) state.activeId = conversationId;
  persist();
  renderAll();
  showToast('对话已恢复');
}

function deleteConversation(conversationId) {
  if (state.generating) return showToast('请先停止当前生成');
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  if (!window.confirm(`确定永久删除“${conversation.title}”吗？此操作无法撤销。`)) return;
  state.conversations = state.conversations.filter((item) => item.id !== conversationId);
  if (state.activeId === conversationId) state.activeId = fallbackConversation(conversationId).id;
  if (!state.conversations.some((item) => !item.archived)) {
    const replacement = createConversation();
    state.conversations.push(replacement);
    state.activeId = replacement.id;
  }
  persist();
  renderAll();
  showToast('对话已删除');
}

async function newConversation() {
  if (state.generating) await stopGeneration();
  const current = activeConversation();
  if (!current.messages.length) {
    closeMobileHistory();
    elements.input.focus();
    return;
  }
  const conversation = createConversation();
  state.conversations.push(conversation);
  state.activeId = conversation.id;
  persist();
  closeMobileHistory();
  renderAll();
  elements.input.focus();
}

function finishGeneration(requestId) {
  if (state.generating?.requestId !== requestId) return;
  const conversation = state.conversations.find((item) => item.id === state.generating.conversationId);
  if (conversation) {
    const assistant = conversation.messages.find((message) => message.id === state.generating.assistantId);
    if (assistant && !assistant.content) assistant.content = '未收到模型回复。';
    conversation.updatedAt = Date.now();
  }
  state.generating = null;
  persist();
  renderAll();
  elements.input.focus();
}

async function sendMessage() {
  const content = elements.input.value.trim();
  if (!content || state.generating) return;
  if (connectionState !== 'online') {
    const connected = await refreshConnection({ quiet: true });
    if (!connected) {
      showToast(config.provider === 'ollama' ? '请先启动 Ollama 或检查设置' : '请先配置 API 地址、模型和密钥');
      return;
    }
  }
  const profile = activeProfile();
  if (!profile.model) return showToast('请先选择模型');

  const conversation = activeConversation();
  const userMessage = { id: id(), role: 'user', content, createdAt: Date.now() };
  const assistantMessage = {
    id: id(),
    role: 'assistant',
    content: '',
    model: profile.model,
    provider: config.provider,
    createdAt: Date.now()
  };
  conversation.messages.push(userMessage, assistantMessage);
  conversation.updatedAt = Date.now();
  if (conversation.title === '新对话') conversation.title = content.replace(/\s+/g, ' ').slice(0, 24) || '新对话';

  const requestId = id();
  state.generating = {
    requestId,
    conversationId: conversation.id,
    assistantId: assistantMessage.id,
    startedAt: Date.now(),
    phase: 'preparing',
    thinkEnabled: thinkingSupported === true && config.think,
    thinkingCharacters: 0,
    answerCharacters: 0
  };
  elements.input.value = '';
  autoResizeInput();
  persist();
  renderAll();

  let knowledgeItems = [];
  if (config.knowledge.enabled) {
    state.generating.phase = 'retrieving';
    updateProgressUI();
    const knowledgeResult = await window.localLLM.searchKnowledge({
      query: content,
      endpoint: config.profiles.ollama.endpoint,
      embeddingModel: config.knowledge.embeddingModel,
      rerankerEnabled: config.knowledge.rerankerEnabled,
      rerankerModel: config.knowledge.rerankerModel,
      limit: config.knowledge.topK
    });
    if (state.generating?.requestId !== requestId) return;
    if (knowledgeResult.ok) {
      knowledgeItems = knowledgeResult.items;
      if (knowledgeResult.rerankerWarning) showToast('精排模型不可用，已使用混合排序');
    }
    else showToast(`题库检索未启用：${knowledgeResult.error}`);
  }

  const messages = conversation.messages
    .filter((message) => message.id !== assistantMessage.id)
    .map(({ role, content: messageContent }) => ({ role, content: messageContent }));
  const result = await window.localLLM.startChat({
    provider: config.provider,
    endpoint: profile.endpoint,
    model: profile.model,
    messages,
    think: thinkingSupported === true && config.think,
    systemPrompt: config.systemPrompt,
    disableSystemPrompt: config.systemPromptDisabled,
    knowledgeItems,
    requestId
  });
  if (!result.ok && state.generating?.requestId === requestId) finishGeneration(requestId);
}

async function stopGeneration() {
  if (!state.generating) return;
  const { requestId } = state.generating;
  await window.localLLM.stopChat(requestId);
  finishGeneration(requestId);
  showToast('已停止生成');
}

function autoResizeInput() {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 160)}px`;
  updateSendButton();
}

function applyAppState(nextState) {
  appState = { ...appState, ...nextState };
  document.documentElement.classList.toggle('transparent-mode', appState.transparent);
  document.body.classList.toggle('transparent-mode', appState.transparent);
  if (appState.transparent) {
    clearTimeout(toastTimer);
    elements.toast.classList.remove('visible');
  }
  elements.assistantModeButton.classList.toggle('active', appState.transparent && appState.alwaysOnTop);
  elements.assistantModeButton.setAttribute('aria-pressed', String(appState.transparent && appState.alwaysOnTop));
  elements.protectionButton.setAttribute('aria-pressed', String(appState.contentProtection));
  elements.transparentToggle.checked = appState.transparent;
  elements.alwaysOnTopToggle.checked = appState.alwaysOnTop;
  elements.contentProtectionToggle.checked = appState.contentProtection;
  if (!recordingShortcut) updateShortcutDraft(appState.assistantShortcut || shortcutDraft);
  elements.electronVersion.textContent = appState.electronVersion || '—';

  const enabled = appState.contentProtection;
  elements.securityCardLabel.textContent = `录屏保护：${enabled ? '开启' : '关闭'}`;
  elements.securityDialogTitle.textContent = `录屏保护已${enabled ? '开启' : '关闭'}`;
  elements.securityCurrentState.textContent = enabled ? '正在保护' : '未保护';
  elements.securityCurrentState.classList.toggle('success-text', enabled);
  elements.securityToggleButton.textContent = enabled ? '关闭录屏保护' : '开启录屏保护';
}

async function setAppPreferences(preferences, toastMessage = '') {
  if (typeof preferences?.transparent === 'boolean') {
    applyAppState({
      ...appState,
      transparent: preferences.transparent,
      alwaysOnTop: preferences.transparent ? true : (preferences.alwaysOnTop ?? appState.alwaysOnTop)
    });
  }
  const result = await window.localLLM.setAppPreferences(preferences);
  applyAppState(result);
  if (toastMessage) showToast(toastMessage);
  if (result.shortcutError) showToast(result.shortcutError);
  return result;
}

function toggleAssistantMode() {
  const enabled = !appState.transparent;
  return setAppPreferences({ transparent: enabled, alwaysOnTop: enabled });
}

async function updateSecretState(provider) {
  if (provider === 'ollama') return;
  const result = await window.localLLM.getSecretState({ provider });
  elements.apiKeyStatus.textContent = result.hasApiKey
    ? `已保存密钥${result.encrypted ? ' · 系统加密' : ' · 未加密'}`
    : '尚未保存密钥';
  elements.apiKeyStatus.classList.toggle('success-text', result.hasApiKey);
}

function renderProviderModelDraft(provider) {
  const models = providerModelDrafts[provider] || [];
  elements.apiModelList.replaceChildren(...models.map((model) => {
    const chip = document.createElement('span');
    chip.className = 'configured-model-chip';
    const label = document.createElement('span');
    label.textContent = model;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.model = model;
    remove.title = `移除 ${model}`;
    remove.setAttribute('aria-label', remove.title);
    remove.textContent = '×';
    chip.append(label, remove);
    return chip;
  }));
}

function addProviderModelDraft() {
  const provider = elements.providerSelect.value;
  if (provider === 'ollama') return;
  const model = elements.apiModelInput.value.trim();
  if (!model) return;
  providerModelDrafts[provider] ||= [];
  if (!providerModelDrafts[provider].includes(model)) providerModelDrafts[provider].push(model);
  elements.apiModelInput.value = '';
  renderProviderModelDraft(provider);
}

function displayShortcut(shortcut) {
  return String(shortcut || '未设置')
    .replace(/CommandOrControl|Command/g, '⌘')
    .replace(/Control/g, '⌃')
    .replace(/Alt/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, '');
}

function updateShortcutDraft(shortcut) {
  shortcutDraft = shortcut;
  elements.assistantShortcutInput.value = displayShortcut(shortcut);
}

async function fillProviderSettings() {
  const provider = elements.providerSelect.value;
  const profile = config.profiles[provider];
  elements.endpointInput.value = profile.endpoint;
  elements.apiSettings.hidden = provider === 'ollama';
  elements.apiModelInput.value = '';
  renderProviderModelDraft(provider);
  elements.apiKeyInput.value = '';
  elements.clearApiKey.checked = false;
  if (provider !== 'ollama') await updateSecretState(provider);
}

async function openSettings() {
  elements.providerSelect.value = config.provider;
  providerModelDrafts = Object.fromEntries(Object.entries(config.profiles).map(([provider, profile]) => [provider, [...profile.models]]));
  systemPromptDisabledDraft = config.systemPromptDisabled;
  elements.systemPromptInput.value = config.systemPromptDisabled
    ? ''
    : (config.systemPrompt || appState.defaultSystemPrompt || '');
  updateShortcutDraft(appState.assistantShortcut || 'Command+Shift+A');
  elements.shortcutStatus.textContent = '点击“录制”后按下新的组合键';
  elements.shortcutStatus.classList.remove('recording');
  elements.knowledgeEnabledToggle.checked = config.knowledge.enabled;
  elements.embeddingModelInput.value = config.knowledge.embeddingModel;
  elements.rerankerEnabledToggle.checked = config.knowledge.rerankerEnabled;
  elements.rerankerModelInput.value = config.knowledge.rerankerModel;
  applyAppState(appState);
  await fillProviderSettings();
  await refreshKnowledgeStatus();
  elements.settingsDialog.showModal();
  elements.providerSelect.focus();
}

async function refreshKnowledgeStatus() {
  elements.knowledgeStatus.className = 'knowledge-status working';
  elements.knowledgeStatus.textContent = '正在读取本地 SQLite 题库…';
  const result = await window.localLLM.getKnowledgeStatus();
  if (!result.ok) {
    elements.knowledgeStatus.className = 'knowledge-status error';
    elements.knowledgeStatus.textContent = result.error || '题库读取失败';
    return;
  }
  elements.knowledgeStatus.className = 'knowledge-status';
  elements.knowledgeStatus.textContent = result.count
    ? `共 ${result.count} 条 · ${result.embedded} 条已有向量索引`
    : '题库为空；导入后仅保存在本机 SQLite 中';
}

async function importKnowledge() {
  const endpoint = config.profiles.ollama.endpoint;
  const embeddingModel = elements.embeddingModelInput.value.trim() || 'veil-qwen3-embedding:0.6b-q8';
  elements.importKnowledgeButton.disabled = true;
  elements.knowledgeStatus.className = 'knowledge-status working';
  elements.knowledgeStatus.textContent = '请选择题库文件…';
  const result = await window.localLLM.importKnowledge({ endpoint, embeddingModel });
  elements.importKnowledgeButton.disabled = false;
  if (result.canceled) return refreshKnowledgeStatus();
  if (!result.ok) {
    elements.knowledgeStatus.className = 'knowledge-status error';
    elements.knowledgeStatus.textContent = `${result.error || '导入失败'}；请确认 Ollama 已安装 ${embeddingModel}`;
    return;
  }
  elements.knowledgeStatus.className = 'knowledge-status';
  elements.knowledgeStatus.textContent = `已导入 ${result.imported} 条 · 当前共 ${result.count} 条`;
}

async function clearKnowledgeBase() {
  if (!window.confirm('确定清空本机个人题库吗？此操作无法撤销。')) return;
  const result = await window.localLLM.clearKnowledge();
  if (!result.ok) {
    elements.knowledgeStatus.className = 'knowledge-status error';
    elements.knowledgeStatus.textContent = result.error || '清空失败';
    return;
  }
  await refreshKnowledgeStatus();
}

function acceleratorFromKeyboardEvent(event) {
  const keyAliases = {
    ' ': 'Space', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down',
    ArrowLeft: 'Left', ArrowRight: 'Right', '+': 'Plus'
  };
  const rawKey = keyAliases[event.key] || event.key;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(rawKey)) return '';
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return '';
  const parts = [];
  if (event.metaKey) parts.push('Command');
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  return [...parts, key].join('+');
}

function handleConversationClick(event) {
  const action = event.target.closest('[data-action]');
  if (action) {
    const { id: conversationId } = action.dataset;
    if (action.dataset.action === 'archive') archiveConversation(conversationId);
    else if (action.dataset.action === 'restore') restoreConversation(conversationId);
    else if (action.dataset.action === 'delete') deleteConversation(conversationId);
    return;
  }
  const button = event.target.closest('.conversation-item');
  if (!button) return;
  const conversation = state.conversations.find((item) => item.id === button.dataset.id);
  if (conversation?.archived) restoreConversation(conversation.id, true);
  else setActiveConversation(button.dataset.id);
}

elements.newChatButton.addEventListener('click', newConversation);
elements.compactNewChatButton.addEventListener('click', newConversation);
elements.historyToggleButton.addEventListener('click', toggleHistory);
elements.sidebarScrim.addEventListener('click', closeMobileHistory);
elements.archiveSectionButton.addEventListener('click', () => {
  config.archivesOpen = !config.archivesOpen;
  persist();
  renderSidebar();
});
elements.conversationList.addEventListener('click', handleConversationClick);
elements.archivedList.addEventListener('click', handleConversationClick);
elements.sendButton.addEventListener('click', sendMessage);
elements.stopButton.addEventListener('click', stopGeneration);
elements.thinkToggle.addEventListener('click', () => {
  if (state.generating || thinkingSupported !== true) return;
  config.think = !config.think;
  persist();
  updateThinkUI();
  showToast(config.think ? '已开启深度思考' : '已切换为快速回答');
});
elements.refreshButton.addEventListener('click', () => refreshConnection());
elements.assistantModeButton.addEventListener('click', toggleAssistantMode);
elements.protectionButton.addEventListener('click', () => {
  setAppPreferences({ contentProtection: !appState.contentProtection }, appState.contentProtection ? '录屏保护已关闭' : '录屏保护已开启');
});
elements.settingsButton.addEventListener('click', openSettings);
elements.offlineSettingsButton.addEventListener('click', openSettings);
elements.securityCard.addEventListener('click', () => elements.securityDialog.showModal());
elements.securityToggleButton.addEventListener('click', () => {
  setAppPreferences({ contentProtection: !appState.contentProtection }, appState.contentProtection ? '录屏保护已关闭' : '录屏保护已开启');
});
elements.providerSelect.addEventListener('change', fillProviderSettings);
elements.addApiModelButton.addEventListener('click', addProviderModelDraft);
elements.apiModelInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addProviderModelDraft();
  }
});
elements.apiModelList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-model]');
  if (!button) return;
  const provider = elements.providerSelect.value;
  providerModelDrafts[provider] = (providerModelDrafts[provider] || []).filter((model) => model !== button.dataset.model);
  renderProviderModelDraft(provider);
});
elements.restoreSystemPromptButton.addEventListener('click', () => {
  elements.systemPromptInput.value = appState.defaultSystemPrompt || '';
  systemPromptDisabledDraft = false;
  showToast('已恢复内置提示词');
});
elements.clearSystemPromptButton.addEventListener('click', () => {
  elements.systemPromptInput.value = '';
  systemPromptDisabledDraft = true;
});
elements.systemPromptInput.addEventListener('input', () => {
  if (elements.systemPromptInput.value.trim()) systemPromptDisabledDraft = false;
});
elements.recordShortcutButton.addEventListener('click', () => {
  recordingShortcut = true;
  elements.shortcutStatus.textContent = '请按下组合键（至少包含 ⌘、⌃ 或 ⌥）…';
  elements.shortcutStatus.classList.add('recording');
});
elements.resetShortcutButton.addEventListener('click', () => {
  recordingShortcut = false;
  updateShortcutDraft('Command+Shift+A');
  elements.shortcutStatus.textContent = '已恢复默认快捷键，保存后生效';
  elements.shortcutStatus.classList.remove('recording');
});
elements.importKnowledgeButton.addEventListener('click', importKnowledge);
elements.clearKnowledgeButton.addEventListener('click', clearKnowledgeBase);
elements.modelSelect.addEventListener('change', () => {
  const target = modelTargets.get(elements.modelSelect.value);
  if (!target) return;
  config.provider = target.provider;
  activeProfile().model = target.model;
  persist();
  renderMessages(true);
  refreshThinkingCapability();
});
elements.input.addEventListener('input', autoResizeInput);
elements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    sendMessage();
  }
});
elements.messageList.addEventListener('click', async (event) => {
  const copyButton = event.target.closest('.copy-code');
  if (copyButton) {
    const code = copyButton.closest('.code-block')?.querySelector('code')?.textContent || '';
    await navigator.clipboard.writeText(code);
    copyButton.textContent = '已复制';
    setTimeout(() => { copyButton.textContent = '复制'; }, 1400);
    return;
  }
  const link = event.target.closest('a[href]');
  if (link) {
    event.preventDefault();
    window.localLLM.openExternal(link.href);
  }
});
elements.settingsForm.addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const provider = elements.providerSelect.value;
  const profile = config.profiles[provider];
  profile.endpoint = elements.endpointInput.value.trim().replace(/\/$/, '');
  if (provider !== 'ollama') {
    addProviderModelDraft();
  }
  for (const remoteProvider of ['gemini', 'deepseek', 'openai']) {
    const remoteProfile = config.profiles[remoteProvider];
    remoteProfile.models = [...(providerModelDrafts[remoteProvider] || [])];
    remoteProfile.model = remoteProfile.models.includes(remoteProfile.model)
      ? remoteProfile.model
      : (remoteProfile.models[0] || '');
  }

  if (provider !== 'ollama') {
    await window.localLLM.saveSecret({
      provider,
      apiKey: elements.apiKeyInput.value,
      clear: elements.clearApiKey.checked
    });
  }
  config.provider = provider;
  config.systemPrompt = elements.systemPromptInput.value.trim();
  config.systemPromptDisabled = systemPromptDisabledDraft || !config.systemPrompt;
  config.knowledge.enabled = elements.knowledgeEnabledToggle.checked;
  config.knowledge.embeddingModel = elements.embeddingModelInput.value.trim() || 'veil-qwen3-embedding:0.6b-q8';
  config.knowledge.rerankerEnabled = elements.rerankerEnabledToggle.checked;
  config.knowledge.rerankerModel = elements.rerankerModelInput.value.trim() || 'veil-qwen3-reranker:0.6b-int8';
  persist();
  await setAppPreferences({
    transparent: elements.transparentToggle.checked,
    alwaysOnTop: elements.alwaysOnTopToggle.checked,
    contentProtection: elements.contentProtectionToggle.checked,
    assistantShortcut: shortcutDraft
  });
  elements.settingsDialog.close();
  await refreshConnection();
});
document.addEventListener('keydown', (event) => {
  if (recordingShortcut) {
    event.preventDefault();
    event.stopPropagation();
    const accelerator = acceleratorFromKeyboardEvent(event);
    if (!accelerator) return;
    recordingShortcut = false;
    updateShortcutDraft(accelerator);
    elements.shortcutStatus.textContent = `将使用 ${displayShortcut(accelerator)}，保存后生效`;
    elements.shortcutStatus.classList.remove('recording');
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'a' && !appState.assistantShortcut) {
    event.preventDefault();
    toggleAssistantMode();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    newConversation();
  }
  if (event.key === 'Escape' && mobileHistoryOpen) closeMobileHistory();
  if (event.key === 'Escape' && state.generating && !elements.settingsDialog.open && !elements.securityDialog.open) {
    stopGeneration();
  } else if (event.key === 'Escape' && appState.transparent && !elements.settingsDialog.open && !elements.securityDialog.open) {
    setAppPreferences({ transparent: false, alwaysOnTop: false });
  }
});
window.addEventListener('resize', updateHistoryUI);

window.localLLM.onChatProgress(({ requestId, phase, characters = 0 }) => {
  const progress = state.generating;
  if (progress?.requestId !== requestId) return;
  if (phase === 'processing' && !['thinking', 'answering'].includes(progress.phase)) progress.phase = 'processing';
  else if (phase === 'thinking' && progress.phase !== 'answering') {
    progress.phase = 'thinking';
    progress.thinkingCharacters += characters;
  } else if (phase === 'answering') {
    progress.phase = 'answering';
    progress.answerCharacters += characters;
  }
  updateProgressUI();
});

window.localLLM.onChatChunk(({ requestId, content }) => {
  if (state.generating?.requestId !== requestId) return;
  const conversation = state.conversations.find((item) => item.id === state.generating.conversationId);
  const assistant = conversation?.messages.find((message) => message.id === state.generating.assistantId);
  if (!assistant) return;
  assistant.content += content;
  conversation.updatedAt = Date.now();
  persist();
  if (conversation.id === state.activeId) renderMessages();
});

window.localLLM.onChatDone(({ requestId, stopped, metrics }) => {
  if (state.generating?.requestId !== requestId) return;
  finishGeneration(requestId);
  if (stopped) return;
  const speed = metrics?.tokensPerSecond;
  const tokens = metrics?.evalCount;
  if (speed > 0 && tokens > 0) showToast(`回答完成 · ${speed.toFixed(1)} tokens/s · ${tokens} tokens`);
  else showToast('回答完成');
});

window.localLLM.onChatError(({ requestId, error }) => {
  if (state.generating?.requestId !== requestId) return;
  const conversation = state.conversations.find((item) => item.id === state.generating.conversationId);
  const assistant = conversation?.messages.find((message) => message.id === state.generating.assistantId);
  if (assistant && !assistant.content) assistant.content = `生成失败：${error}`;
  showToast(error || '生成失败');
  finishGeneration(requestId);
});

window.localLLM.onAppPreferencesChanged((nextState) => applyAppState(nextState));
window.localLLM.onKnowledgeProgress(({ phase, completed, total }) => {
  const action = phase === 'embedding' ? '正在生成向量' : '正在写入 SQLite';
  elements.knowledgeStatus.className = 'knowledge-status working';
  elements.knowledgeStatus.textContent = `${action} · ${completed}/${total}`;
});
elements.settingsDialog.addEventListener('close', () => {
  recordingShortcut = false;
  elements.shortcutStatus.classList.remove('recording');
});

async function initialize() {
  renderAll();
  autoResizeInput();
  const initialAppState = await window.localLLM.getAppState();
  applyAppState(initialAppState);
  await refreshConnection({ quiet: true });
  elements.input.focus();
}

initialize();
