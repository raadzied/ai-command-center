import { contextBridge, ipcRenderer } from 'electron';

interface ApprovalPayload {
  auditId: string;
  action: {
    type: string;
    target: string;
    reason: string;
    risk: string;
    explanation: string;
  };
}

contextBridge.exposeInMainWorld('api', {
  sendInput: (text: string): Promise<unknown> =>
    ipcRenderer.invoke('process:input', text),
  respondApproval: (auditId: string, approved: boolean): void => {
    ipcRenderer.send('approval:response', { auditId, approved });
  },
  onApprovalRequest: (
    callback: (data: ApprovalPayload) => void,
  ): void => {
    ipcRenderer.on('approval:request', (_event, data: ApprovalPayload) =>
      callback(data),
    );
  },
  onAgentActive: (cb: (agent: string | null) => void): void => {
    ipcRenderer.removeAllListeners('agent:active');
    ipcRenderer.on('agent:active', (_e, agent: string | null) => cb(agent));
  },
  onTaskStart: (cb: (data: { index: number; total: number }) => void): void => {
    ipcRenderer.removeAllListeners('task:start');
    ipcRenderer.on('task:start', (_e, data: { index: number; total: number }) => cb(data));
  },
  getVoiceStatus: (): Promise<boolean> => ipcRenderer.invoke('voice:status'),
  toggleVoice: (enabled?: boolean): Promise<boolean> => ipcRenderer.invoke('voice:toggle', enabled),
  stopVoice: (): Promise<void> => ipcRenderer.invoke('voice:stop'),
  // دوال الصوت الجديد
  onVoiceAudio: (cb: (data: { base64Mp3: string; agentName: string | null }) => void): void => {
    ipcRenderer.removeAllListeners('voice:audio');
    ipcRenderer.on('voice:audio', (_e, data: { base64Mp3: string; agentName: string | null }) => cb(data));
  },
  onVoiceStop: (cb: () => void): void => {
    ipcRenderer.removeAllListeners('voice:stop-audio');
    ipcRenderer.on('voice:stop-audio', () => cb());
  },
  // دوال Whisper Flow الجديد
  transcribeAudio: (
    base64Audio: string,
  ): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('voice:transcribe', base64Audio),
});
