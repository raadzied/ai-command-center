const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  sendInput: (text) => ipcRenderer.invoke('process:input', text),
  cancelRun: () => ipcRenderer.invoke('run:cancel'),
  respondApproval: (auditId, approved) => {
    ipcRenderer.send('approval:response', { auditId, approved });
  },
  onApprovalRequest: (callback) => subscribe('approval:request', callback),
  onAgentActive: (callback) => subscribe('agent:active', callback),
  onTaskStart: (callback) => subscribe('task:start', callback),
  onAgentConsult: (callback) => subscribe('agent:consult', callback),
  onRunPhase: (callback) => subscribe('run:phase', callback),
  getVoiceStatus: () => ipcRenderer.invoke('voice:status'),
  toggleVoice: (enabled) => ipcRenderer.invoke('voice:toggle', enabled),
  stopVoice: () => ipcRenderer.invoke('voice:stop'),
  transcribeAudio: (audio, mimeType) => ipcRenderer.invoke('voice:transcribe', audio, mimeType),
  onVoiceAudio: (callback) => subscribe('voice:audio', callback),
  onVoiceStop: (callback) => subscribe('voice:stop-audio', callback),
  getMemoryStats: () => ipcRenderer.invoke('memory:stats'),
  getAssistantSettings: () => ipcRenderer.invoke('assistant:settings:get'),
  setAssistantMode: (mode) => ipcRenderer.invoke('assistant:settings:mode', mode),
  setPermission: (permission, enabled) =>
    ipcRenderer.invoke('assistant:settings:permission', { permission, enabled }),

  // workspace bridge functions
  getWorkspaceContext: () => ipcRenderer.invoke('workspace:context'),
  getProjectBrief: () => ipcRenderer.invoke('workspace:brief:get'),
  refreshProjectBrief: () => ipcRenderer.invoke('workspace:brief:refresh'),
  pickFolder: () => ipcRenderer.invoke('workspace:pick-folder'),
  switchProject: (projectId, sessionId) => ipcRenderer.invoke('workspace:switch-project', projectId, sessionId),
  createSession: () => ipcRenderer.invoke('workspace:session:create'),
  selectSession: (sessionId) => ipcRenderer.invoke('workspace:session:select', sessionId),
  renameSession: (sessionId, newName) => ipcRenderer.invoke('workspace:session:rename', sessionId, newName),
  deleteSession: (sessionId) => ipcRenderer.invoke('workspace:session:delete', sessionId),
  sessionMessages: () => ipcRenderer.invoke('workspace:session:messages'),
  openProjectWindow: (projectId) => ipcRenderer.invoke('workspace:open-window', projectId),
  getHudSnapshot: () => ipcRenderer.invoke('hud:snapshot'),
  listSkills: () => ipcRenderer.invoke('skills:list'),
  toggleSkill: (skillId, enabled) => ipcRenderer.invoke('skills:toggle', skillId, enabled),
  importSkill: () => ipcRenderer.invoke('skills:import'),
  listMcps: () => ipcRenderer.invoke('mcp:list'),
  toggleMcp: (mcpId, enabled) => ipcRenderer.invoke('mcp:toggle', mcpId, enabled),
  addMcp: (details) => ipcRenderer.invoke('mcp:add', details),
  removeMcp: (mcpId) => ipcRenderer.invoke('mcp:remove', mcpId),
});
