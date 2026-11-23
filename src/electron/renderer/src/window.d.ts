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

export interface WorkspaceScope {
  kind: 'daily' | 'workspace';
  windowId: number | null;
  projectId: number | null;
  sessionId: number | null;
  workspaceRoot?: string;
}

export interface WorkspaceContext {
  ok: boolean;
  error?: string;
  scope?: WorkspaceScope;
  dailyMode?: boolean;
  projects?: Array<{ id: number; name: string; rootPath: string }>;
  sessions?: Array<{ id: number; title: string }>;
  activeSessionId?: number | null;
}

export interface WorkspaceActionResult {
  ok: boolean;
  error?: string;
}

export interface WorkspacePickResult extends WorkspaceActionResult {
  projectId?: number;
  sessionId?: number | null;
}

export interface WorkspaceSwitchResult extends WorkspaceActionResult {
  scope?: WorkspaceScope;
}

export interface WorkspaceCreateResult extends WorkspaceActionResult {
  sessionId?: number;
}

export interface SessionMessage {
  role: string;
  content: string;
  agentName: string | null;
}

export interface WorkspaceMessagesResult extends WorkspaceActionResult {
  messages?: SessionMessage[];
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
      getWorkspaceContext: () => Promise<WorkspaceContext>;
      pickFolder: () => Promise<WorkspacePickResult>;
      switchProject: (projectId: number | null, sessionId: number | null) => Promise<WorkspaceSwitchResult>;
      createSession: () => Promise<WorkspaceCreateResult>;
      selectSession: (sessionId: number) => Promise<WorkspaceActionResult>;
      renameSession: (newName: string) => Promise<WorkspaceActionResult>;
      sessionMessages: () => Promise<WorkspaceMessagesResult>;
    };
  }
}