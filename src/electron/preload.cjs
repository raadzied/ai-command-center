const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  sendInput: (text) => ipcRenderer.invoke('process:input', text),
  respondApproval: (auditId, approved) => {
    ipcRenderer.send('approval:response', { auditId, approved });
  },
  onApprovalRequest: (callback) => subscribe('approval:request', callback),
  onAgentActive: (callback) => subscribe('agent:active', callback),
  onTaskStart: (callback) => subscribe('task:start', callback),
  getVoiceStatus: () => ipcRenderer.invoke('voice:status'),
  toggleVoice: (enabled) => ipcRenderer.invoke('voice:toggle', enabled),
  stopVoice: () => ipcRenderer.invoke('voice:stop'),
  transcribeAudio: (audio) => ipcRenderer.invoke('voice:transcribe', audio),
  onVoiceAudio: (callback) => subscribe('voice:audio', callback),
  onVoiceStop: (callback) => subscribe('voice:stop-audio', callback),
  getMemoryStats: () => ipcRenderer.invoke('memory:stats'),
  getAssistantSettings: () => ipcRenderer.invoke('assistant:settings:get'),
  setAssistantMode: (mode) => ipcRenderer.invoke('assistant:settings:mode', mode),
  setPermission: (permission, enabled) =>
    ipcRenderer.invoke('assistant:settings:permission', { permission, enabled }),
});
