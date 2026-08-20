const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('localLLM', {
  getAppState: () => ipcRenderer.invoke('app:state'),
  setAppPreferences: (preferences) => ipcRenderer.invoke('app:set-preferences', preferences),
  checkConnection: (config) => ipcRenderer.invoke('provider:check', config),
  inspectModel: (config) => ipcRenderer.invoke('model:inspect', config),
  getSecretState: (config) => ipcRenderer.invoke('provider:secret-state', config),
  saveSecret: (config) => ipcRenderer.invoke('provider:save-secret', config),
  startChat: (payload) => ipcRenderer.invoke('chat:generate', payload),
  stopChat: (requestId) => ipcRenderer.invoke('chat:stop', requestId),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  onChatProgress: (callback) => subscribe('chat:progress', callback),
  onChatChunk: (callback) => subscribe('chat:chunk', callback),
  onChatDone: (callback) => subscribe('chat:done', callback),
  onChatError: (callback) => subscribe('chat:error', callback)
});
