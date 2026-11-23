// MCP IPC: list/toggle/add/remove, resolved from the sender window.

import { dialog, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { logger as log } from '../llm/logger.js';
import { getDb } from '../memory/db.js';
import {
  listMcpsForProject, removeMcpServer, setProjectMcpEnabled, upsertMcpServer,
} from '../memory/mcp-catalog.js';
import type { ProjectMcpView } from '../memory/mcp-catalog.js';
import {
  connectMcpForWindow, disconnectMcpForWindow, ensureBundledMcps, getMcpRuntimeStatus,
} from '../tools/mcp-manager.js';
import { getWindowEntry } from './window-registry.js';
import type { WindowEntry } from './window-registry.js';

const AddSchema = z.object({
  name: z.string().min(2).max(60),
  entryPath: z.string().min(1).optional(),
  args: z.array(z.string().min(1).max(200)).max(32).optional(),
  secretRef: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
});

interface McpView extends ProjectMcpView {
  status: 'connected' | 'stopped' | 'error';
  toolCount: number;
  tools: string[];
  error?: string;
}

interface McpsResult {
  ok: boolean;
  error?: string;
  servers: McpView[];
}

function contextOf(event: IpcMainInvokeEvent): { win: BrowserWindow; entry: WindowEntry } | null {
  const entry = getWindowEntry(event.sender.id);
  const win = BrowserWindow.fromWebContents(event.sender);
  return entry && win && !win.isDestroyed() ? { win, entry } : null;
}

function fail(message: string): McpsResult {
  return { ok: false, error: message, servers: [] };
}

function projectIdOf(entry: WindowEntry): number | null {
  return entry.scope.kind === 'workspace' ? entry.scope.projectId : null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function payload(webContentsId: number, entry: WindowEntry): Promise<McpView[]> {
  const list = listMcpsForProject(getDb(), projectIdOf(entry));
  return list.map((server: ProjectMcpView): McpView => {
    const runtime = getMcpRuntimeStatus(webContentsId, server.id);
    return {
      ...server, status: runtime.status, toolCount: runtime.toolCount, tools: runtime.tools,
      ...(runtime.error === undefined ? {} : { error: runtime.error }),
    };
  });
}

/** Registers four MCP IPC handlers. */
export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:list', async (event): Promise<McpsResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    try {
      ensureBundledMcps(getDb());
      return { ok: true, servers: await payload(event.sender.id, ctx.entry) };
    } catch (err) {
      log.warn('mcp:list failed', { message: messageOf(err) });
      return fail(messageOf(err));
    }
  });

  ipcMain.handle('mcp:toggle', async (event, mcpId: number, enabled: boolean): Promise<McpsResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    if (!Number.isInteger(mcpId) || mcpId < 1 || typeof enabled !== 'boolean') {
      return fail('Invalid toggle request');
    }
    const wcId = event.sender.id;
    try {
      setProjectMcpEnabled(getDb(), projectIdOf(ctx.entry), mcpId, enabled);
      if (enabled) {
        await disconnectMcpForWindow(wcId, mcpId);
        await connectMcpForWindow(getDb(), wcId, mcpId, ctx.entry.scope);
      } else {
        await disconnectMcpForWindow(wcId, mcpId);
      }
      return { ok: true, servers: await payload(wcId, ctx.entry) };
    } catch (err) {
      log.warn('mcp:toggle failed', { mcpId, message: messageOf(err) });
      return fail(messageOf(err));
    }
  });

  ipcMain.handle('mcp:add', async (event, input: unknown): Promise<McpsResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    const parsed = AddSchema.safeParse(input);
    if (!parsed.success) return fail('Invalid MCP server details');
    let entryPath = parsed.data.entryPath ?? '';
    if (entryPath === '') {
      const picked = await dialog.showOpenDialog(ctx.win, {
        filters: [{ name: 'JavaScript Server', extensions: ['js', 'mjs', 'cjs'] }],
        properties: ['openFile'],
      });
      if (picked.canceled || picked.filePaths.length === 0) return fail('No server file selected');
      entryPath = picked.filePaths[0] ?? '';
    }
    if (entryPath === '') return fail('No server file selected');
    try {
      const args = parsed.data.args ?? [];
      const slugBase = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const slug = slugBase.length >= 3
        ? slugBase.slice(0, 48)
        : `custom-${createHash('sha256').update(parsed.data.name).digest('hex').slice(0, 8)}`;
      const configHash = createHash('sha256')
        .update(`${entryPath}|${args.join('|')}`).digest('hex');
      upsertMcpServer(getDb(), {
        slug, name: parsed.data.name, transport: 'stdio', runtime: 'node',
        entryPath, args, secretRef: parsed.data.secretRef ?? null,
        configHash, defaultEnabled: false,
      });
      return { ok: true, servers: await payload(event.sender.id, ctx.entry) };
    } catch (err) {
      log.warn('mcp:add failed', { message: messageOf(err) });
      return fail(messageOf(err));
    }
  });

  ipcMain.handle('mcp:remove', async (event, mcpId: number): Promise<McpsResult> => {
    const ctx = contextOf(event);
    if (!ctx) return fail('Window not registered');
    if (!Number.isInteger(mcpId) || mcpId < 1) return fail('Invalid MCP id');
    try {
      await disconnectMcpForWindow(event.sender.id, mcpId);
      removeMcpServer(getDb(), mcpId);
      return { ok: true, servers: await payload(event.sender.id, ctx.entry) };
    } catch (err) {
      log.warn('mcp:remove failed', { mcpId, message: messageOf(err) });
      return fail(messageOf(err));
    }
  });
}
