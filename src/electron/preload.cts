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
});