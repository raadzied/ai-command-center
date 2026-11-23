import type { ActionType } from '../types.js';
import { getDb } from '../memory/db.js';

export type AssistantMode = 'planning' | 'build';
export type PermissionId = ActionType;

export interface AssistantSettings {
  mode: AssistantMode;
  permissions: Record<PermissionId, boolean>;
}

const PERMISSION_IDS: readonly PermissionId[] = [
  'file_read',
  'file_write',
  'file_delete',
  'terminal',
  'http_request',
  'git_operation',
  'mcp_tool',
];

const DEFAULT_PERMISSIONS: Record<PermissionId, boolean> = {
  file_read: true,
  file_write: true,
  file_delete: false,
  terminal: false,
  http_request: false,
  git_operation: false,
  // mcp_tool is allowed by the permission gate, but every call is still
  // classified as `review` and goes through the per-window approval bridge.
  mcp_tool: true,
};

const SETTING_PREFIX = 'assistant:';
let mode: AssistantMode = 'build';
let permissions: Record<PermissionId, boolean> = { ...DEFAULT_PERMISSIONS };
let alwaysConfirmChanges = false;

function saveSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO user_profile (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run(`${SETTING_PREFIX}${key}`, value);
}

export function initializeAssistantSettings(): AssistantSettings {
  const rows = getDb()
    .prepare('SELECT key, value FROM user_profile WHERE key LIKE ?')
    .all(`${SETTING_PREFIX}%`) as Array<{ key: string; value: string }>;

  mode = 'planning';
  permissions = { ...DEFAULT_PERMISSIONS };
  alwaysConfirmChanges = true;

  for (const row of rows) {
    const key = row.key.slice(SETTING_PREFIX.length);
    if (key === 'mode' && (row.value === 'planning' || row.value === 'build')) {
      mode = row.value;
      continue;
    }

    const permissionKey = key.startsWith('permission:')
      ? key.slice('permission:'.length)
      : '';
    if (isPermissionId(permissionKey)) {
      permissions[permissionKey] = row.value === 'true';
    }
  }

  return getAssistantSettings();
}

export function getAssistantSettings(): AssistantSettings {
  return { mode, permissions: { ...permissions } };
}

export function getAssistantMode(): AssistantMode {
  return mode;
}

export function setAssistantMode(next: AssistantMode): AssistantSettings {
  saveSetting('mode', next);
  mode = next;
  return getAssistantSettings();
}

export function setPermission(
  permission: PermissionId,
  enabled: boolean,
): AssistantSettings {
  saveSetting(`permission:${permission}`, String(enabled));
  permissions[permission] = enabled;
  return getAssistantSettings();
}

export function isActionAllowed(action: ActionType): boolean {
  if (mode === 'planning' && action !== 'file_read') return false;
  return permissions[action];
}

export function requiresConfirmation(action: ActionType): boolean {
  return alwaysConfirmChanges && action !== 'file_read';
}

export function isPermissionId(value: unknown): value is PermissionId {
  return typeof value === 'string' && PERMISSION_IDS.some((id) => id === value);
}
