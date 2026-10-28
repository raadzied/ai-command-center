export {};

export interface ApprovalAction {
  type: string;
  target: string;
  reason: string;
  risk: string;
  explanation: string;
}

export interface ApprovalRequestData {
  auditId: string;
  action: ApprovalAction;
}

declare global {
  interface Window {
    api: {
      sendInput: (text: string) => Promise<{
        ok: boolean;
        intent?: string;
        agentUsed?: string | null;
        content?: string;
        elapsedMs?: number;
        error?: string;
      }>;
      respondApproval: (auditId: string, approved: boolean) => void;
      onApprovalRequest: (callback: (data: ApprovalRequestData) => void) => void;
      onAgentActive: (cb: (agent: string | null) => void) => void;
      onTaskStart: (cb: (data: { index: number; total: number }) => void) => void;
      getVoiceStatus: () => Promise<boolean>;
      toggleVoice: (enabled?: boolean) => Promise<boolean>;
      stopVoice: () => Promise<void>;
      // دوال الصوت الجديد
      onVoiceAudio: (cb: (data: { base64Mp3: string; agentName: string | null }) => void) => void;
      onVoiceStop: (cb: () => void) => void;
    };
  }
}
