import type { HudSnapshot } from './hud-api';

export {};

export interface DiffPreview { isNew: boolean; diff: string; added: number; removed: number; beforeHash: string | null; }

export interface ApprovalAction { type: string; target: string; reason: string; risk: string; explanation: string; preview?: DiffPreview; }

export interface ApprovalRequestData {
  auditId: string;
  action: ApprovalAction;
  projectName?: string;
  sessionTitle?: string;
}

export type AssistantMode = 'planning' | 'build';
export type AssistantPermission =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'terminal'
  | 'http_request'
  | 'git_operation'
  | 'mcp_tool';

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

export interface RunPhaseData {
  phase: string;
  detail?: string;
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

export interface ProjectBriefEntry { path: string; kind: 'file' | 'directory'; }

export interface ProjectBrief {
  workspaceRoot: string;
  generatedAt: string;
  fileCount: number;
  entries: ProjectBriefEntry[];
  packageName?: string;
  scripts: Record<string, string>;
  dependencies: string[];
  detectedFiles: string[];
  readmeSnippet?: string;
  agentsSnippet?: string;
}

export type ProjectBriefResult =
  { ok: true; brief: ProjectBrief } | { ok: false; mode: 'daily' } | { ok: false; error: string };

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

export interface SkillView {
  id: number;
  slug: string;
  name: string;
  description: string;
  source: 'bundled' | 'global' | 'project';
  scopeProjectId: number | null;
  path: string | null;
  contentHash: string;
  defaultEnabled: boolean;
  effectiveEnabled: boolean;
  hasOverride: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillsResult {
  ok: boolean;
  error?: string;
  skills: SkillView[];
}

export interface McpView {
  id: number;
  slug: string;
  name: string;
  transport: 'stdio' | 'http';
  runtime: 'node' | 'http';
  entryPath: string | null;
  args: string[];
  url: string | null;
  secretRef: string | null;
  configHash: string;
  defaultEnabled: boolean;
  approvedHash: string | null;
  effectiveEnabled: boolean;
  hasOverride: boolean;
  status: 'connected' | 'stopped' | 'error';
  toolCount: number;
  tools: string[];
  error?: string;
}

export interface McpsResult {
  ok: boolean;
  error?: string;
  servers: McpView[];
}

export interface McpAddInput {
  name: string;
  entryPath?: string;
  args?: string[];
  secretRef?: string;
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
      cancelRun: () => Promise<{ ok: boolean; cancelled: boolean }>;
      respondApproval: (auditId: string, approved: boolean) => void;
      onApprovalRequest: (callback: (data: ApprovalRequestData) => void) => () => void;
      onAgentActive: (cb: (agent: string | null) => void) => () => void;
      onTaskStart: (cb: (data: { index: number; total: number }) => void) => () => void;
      onRunPhase: (cb: (data: RunPhaseData) => void) => () => void;
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
      getProjectBrief: () => Promise<ProjectBriefResult>;
      refreshProjectBrief: () => Promise<ProjectBriefResult>;
      pickFolder: () => Promise<WorkspacePickResult>;
      switchProject: (projectId: number | null, sessionId: number | null) => Promise<WorkspaceSwitchResult>;
      createSession: () => Promise<WorkspaceCreateResult>;
      selectSession: (sessionId: number) => Promise<WorkspaceActionResult>;
      renameSession: (sessionId: number, newName: string) => Promise<WorkspaceContext>;
      deleteSession: (sessionId: number) => Promise<WorkspaceContext>;
      sessionMessages: () => Promise<WorkspaceMessagesResult>;
      openProjectWindow: (projectId: number) => Promise<{ ok: boolean; focusedExisting?: boolean }>;
      listSkills: () => Promise<SkillsResult>;
      toggleSkill: (skillId: number, enabled: boolean) => Promise<SkillsResult>;
      importSkill: () => Promise<SkillsResult>;
      getHudSnapshot: () => Promise<HudSnapshot>;
      listMcps: () => Promise<McpsResult>;
      toggleMcp: (mcpId: number, enabled: boolean) => Promise<McpsResult>;
      addMcp: (details: McpAddInput) => Promise<McpsResult>;
      removeMcp: (mcpId: number) => Promise<McpsResult>;
    };
  }
}
