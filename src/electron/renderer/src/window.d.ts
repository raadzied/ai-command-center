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

export type AssistantMode = 'planning' | 'build';
export type AssistantPermission =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'terminal'
  | 'http_request'
  | 'git_operation';

export interface AssistantSettings {
  mode: AssistantMode;
  permissions: Record<AssistantPermission, boolean>;
}

export interface MemoryStats {
  conversations: number;
  decisions: number;
  projects: number;
  skills: number;
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
      onApprovalRequest: (callback: (data: ApprovalRequestData) => void) => () => void;
      onAgentActive: (cb: (agent: string | null) => void) => () => void;
      onTaskStart: (cb: (data: { index: number; total: number }) => void) => () => void;
      getVoiceStatus: () => Promise<boolean>;
      toggleVoice: (enabled?: boolean) => Promise<boolean>;
      stopVoice: () => Promise<void>;
      transcribeAudio: (audio: string) => Promise<{
        ok: boolean;
        text?: string;
        error?: string;
      }>;
      onVoiceAudio: (cb: (data: { base64Mp3: string; agentName: string | null }) => void) => () => void;
      onVoiceStop: (cb: () => void) => () => void;
      getMemoryStats: () => Promise<MemoryStats>;
      getAssistantSettings: () => Promise<AssistantSettings>;
      setAssistantMode: (mode: AssistantMode) => Promise<AssistantSettings>;
      setPermission: (
        permission: AssistantPermission,
        enabled: boolean,
      ) => Promise<AssistantSettings>;
    };
  }
}
