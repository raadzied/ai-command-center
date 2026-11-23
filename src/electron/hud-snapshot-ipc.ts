// Real HUD snapshot: every number comes from the main process, never the UI mock data.

import { ipcMain } from 'electron';
import { readdirSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { logger as log } from '../llm/logger.js';
import { getDb } from '../memory/db.js';
import { listMcpsForProject } from '../memory/mcp-catalog.js';
import { getRecentSessionMessages } from '../memory/sessions.js';
import { loadActiveInstructionSkills } from '../core/skills-manager.js';
import { getAssistantMode } from '../security/settings.js';
import type { AssistantMode } from '../security/settings.js';
import type { RunScope } from '../types.js';
import { getMcpRuntimeStatus } from '../tools/mcp-manager.js';
import { hasPendingApproval } from './approval-bridge.js';
import { getWindowEntry } from './window-registry.js';

const MAX_FILES = 80;

interface HudSnapshot {
  memory: { conversations: number; skills: number; decisions: number; sessions: number; dbSizeKb: number };
  context: { recentMessages: number; activeSkills: number; hasProjectBrief: boolean };
  mcp: { total: number; connected: number; toolCount: number };
  filesystem: { mode: 'daily' | 'workspace'; rootPath: string | null; indexedFiles: number; maxFiles: number };
  telemetry: { rssMb: number; heapMb: number; uptimeSec: number };
  safety: { mode: AssistantMode; pendingApproval: boolean };
}

function countRows(table: 'conversations' | 'skills' | 'decisions' | 'sessions'): number {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number } | undefined;
  return row?.n ?? 0;
}

function databaseSizeKb(): number {
  try {
    const path = getDb().name;
    if (path === ':memory:' || path.startsWith('file:')) return 0;
    return Math.round(statSync(path).size / 1024);
  } catch (err) {
    log.debug('HUD database size unavailable', {
      message: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/** Counts up to MAX_FILES files without ever descending into dependency folders. */
function countIndexedFiles(root: string): number {
  let count = 0;
  const stack: string[] = [root];
  while (stack.length > 0 && count < MAX_FILES) {
    const current = stack.pop();
    if (current === undefined) break;
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (err) {
      log.debug('HUD index skip', {
        current, message: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    for (const entry of entries) {
      if (count >= MAX_FILES) break;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) count += 1;
    }
  }
  return count;
}

function contextOf(scope: RunScope | undefined): HudSnapshot['context'] {
  const empty: HudSnapshot['context'] = { recentMessages: 0, activeSkills: 0, hasProjectBrief: false };
  try {
    const db = getDb();
    const sessionId = scope?.sessionId ?? null;
    const projectId = scope?.kind === 'workspace' ? scope.projectId : null;
    const brief = projectId === null ? undefined : db
      .prepare<[number], { requirements: string | null; architecture: string | null }>(
        'SELECT requirements, architecture FROM projects WHERE id = ?',
      )
      .get(projectId);
    return {
      recentMessages: sessionId === null ? 0 : getRecentSessionMessages(db, sessionId, 100).length,
      activeSkills: loadActiveInstructionSkills(db, scope).length,
      hasProjectBrief: brief !== undefined &&
        ((brief.requirements ?? '').trim() !== '' || (brief.architecture ?? '').trim() !== ''),
    };
  } catch (err) {
    log.warn('HUD context snapshot failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

function mcpOf(webContentsId: number, scope: RunScope | undefined): HudSnapshot['mcp'] {
  const projectId = scope?.kind === 'workspace' ? scope.projectId : null;
  const servers = listMcpsForProject(getDb(), projectId);
  let connected = 0;
  let toolCount = 0;
  for (const server of servers) {
    if (!server.effectiveEnabled) continue;
    const runtime = getMcpRuntimeStatus(webContentsId, server.id);
    if (runtime.status === 'connected') connected += 1;
    toolCount += runtime.toolCount;
  }
  return { total: servers.length, connected, toolCount };
}

/** Registers the single hud:snapshot handler. */
export function registerHudSnapshotHandler(): void {
  ipcMain.handle('hud:snapshot', async (event): Promise<HudSnapshot> => {
    const entry = getWindowEntry(event.sender.id);
    const scope = entry?.scope;
    const wcId = event.sender.id;
    const rootPath = scope?.kind === 'workspace' && scope.workspaceRoot.trim() !== ''
      ? scope.workspaceRoot : null;
    const usage = process.memoryUsage();
    return {
      memory: {
        conversations: countRows('conversations'),
        skills: countRows('skills'),
        decisions: countRows('decisions'),
        sessions: countRows('sessions'),
        dbSizeKb: databaseSizeKb(),
      },
      context: contextOf(scope),
      mcp: mcpOf(wcId, scope),
      filesystem: {
        mode: scope?.kind === 'daily' ? 'daily' : 'workspace',
        rootPath,
        indexedFiles: rootPath === null ? 0 : countIndexedFiles(rootPath),
        maxFiles: MAX_FILES,
      },
      telemetry: {
        rssMb: Math.round((usage.rss / 1048576) * 10) / 10,
        heapMb: Math.round((usage.heapUsed / 1048576) * 10) / 10,
        uptimeSec: Math.round(process.uptime()),
      },
      safety: { mode: getAssistantMode(), pendingApproval: hasPendingApproval(wcId) },
    };
  });
}
