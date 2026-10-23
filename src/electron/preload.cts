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
});