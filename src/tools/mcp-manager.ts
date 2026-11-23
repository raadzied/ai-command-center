// Per-window MCP lifecycle. Servers are launched as direct Node child processes.

import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logger as log } from '../llm/logger.js';
import type { RunScope } from '../types.js';
import { listMcpsForProject, upsertMcpServer } from '../memory/mcp-catalog.js';
import type { ProjectMcpView } from '../memory/mcp-catalog.js';
import { executeWithApproval } from './executor.js';
import type { ExecutionResult } from './executor.js';
import { registerTool, unregisterTool } from './registry.js';

const APP_ROOT = resolve(process.cwd());
const BUNDLED_ENTRY = resolve(APP_ROOT, 'node_modules', 'api-anything', 'dist', 'cli.js');
const SAFE_ENV = ['PATH', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA'];
const SECRET_PATTERN = /(?:api[_-]?key|token|secret|password|authorization)\s*[=:]\s*\S+/gi;

interface ManagedMcpClient {
  readonly client: Client;
  readonly transport: StdioClientTransport;
  status: 'connected' | 'stopped' | 'error';
  serverName: string;
  tools: string[];
  registeredTools: string[];
  error: string | null;
}

export interface McpRuntimeStatus {
  status: 'connected' | 'stopped' | 'error';
  toolCount: number;
  tools: string[];
  error?: string;
}

const clients = new Map<string, ManagedMcpClient>();

function key(webContentsId: number, mcpId: number): string { return `${webContentsId}:${mcpId}`; }
function redact(text: string): string { return text.replace(SECRET_PATTERN, '[redacted]'); }
function scopeProjectId(scope?: RunScope): number | null { return scope?.kind === 'workspace' ? scope.projectId : null; }

/** Resolves and confines a JS entry to the application root. */
export function assertEntryPath(entryPath: string): string {
  if (!isAbsolute(entryPath)) throw new Error('MCP entry path must be absolute');
  if (!existsSync(entryPath)) throw new Error(`MCP entry does not exist: ${entryPath}`);
  const real = realpathSync(entryPath);
  const rel = relative(APP_ROOT, real);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('MCP entry lies outside the application root');
  if (!/\.(?:js|mjs|cjs)$/i.test(real)) throw new Error('MCP entry must be a JavaScript file');
  return real;
}

function buildEnv(secretRef: string | null): Record<string, string> {
  const env: Record<string, string> = {};
  // electron.exe must boot as plain Node for stdio servers (no Chromium/GPU init).
  env.ELECTRON_RUN_AS_NODE = '1';
  for (const name of SAFE_ENV) { const value = process.env[name]; if (typeof value === 'string') env[name] = value; }
  if (secretRef !== null) { const secret = process.env[secretRef]; if (typeof secret === 'string') env[secretRef] = secret; }
  return env;
}

function findServer(db: Database.Database, mcpId: number, scope?: RunScope): ProjectMcpView {
  const server = listMcpsForProject(db, scopeProjectId(scope)).find((item) => item.id === mcpId);
  if (!server) throw new Error('MCP server not found');
  return server;
}

/** Registers the bundled API Anything server only when its CLI is installed. */
export function ensureBundledMcps(db: Database.Database): void {
  if (!existsSync(BUNDLED_ENTRY)) return;
  const configHash = createHash('sha256')
    .update(`${BUNDLED_ENTRY}|mcp`).digest('hex');
  upsertMcpServer(db, {
    slug: 'api-anything', name: 'API Anything', transport: 'stdio', runtime: 'node',
    entryPath: BUNDLED_ENTRY, args: ['mcp'], configHash, defaultEnabled: false,
  });
}

/** Connects one server for one window and registers its tools dynamically. */
export async function connectMcpForWindow(
  db: Database.Database,
  webContentsId: number,
  mcpId: number,
  scope?: RunScope,
): Promise<void> {
  const k = key(webContentsId, mcpId);
  if (clients.has(k)) return;
  const server = findServer(db, mcpId, scope);
  if (server.transport !== 'stdio') throw new Error('Only stdio transport is supported');
  const entry = assertEntryPath(server.entryPath ?? '');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, ...server.args],
    cwd: APP_ROOT,
    env: buildEnv(server.secretRef),
    stderr: 'pipe',
  });
  const client = new Client({ name: 'apex-command-center', version: '0.1.0' });
  const stderr = transport.stderr;
  stderr?.on('data', (chunk: Buffer): void => {
    log.warn('MCP server stderr', {
      mcpId, text: redact(chunk.toString('utf8')).slice(0, 500),
    });
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const tools = listed.tools.map((tool) => tool.name);
    const registeredTools = tools.map((toolName: string): string => {
      const name = `mcp.${webContentsId}.${mcpId}.${toolName}`;
      registerTool({
        name, description: `${server.name}: ${toolName}`, riskLevel: 'executes',
        allowedAgents: ['coder', 'mentor', 'designer'], dynamic: true,
      });
      return name;
    });
    clients.set(k, { client, transport, status: 'connected', serverName: server.name, tools, registeredTools, error: null });
    log.info('MCP connected', { webContentsId, mcpId, tools: tools.length });
  } catch (err) {
    const message = redact(err instanceof Error ? err.message : String(err)).slice(0, 300);
    clients.set(k, { client, transport, status: 'error', serverName: server.name, tools: [], registeredTools: [], error: message });
    try {
      await transport.close();
    } catch (closeErr) {
      log.warn('MCP transport cleanup failed', {
        message: closeErr instanceof Error ? closeErr.message : String(closeErr),
      });
    }
    log.warn('MCP connect failed', { mcpId, message });
  }
}

/** Closes one window/server pair and removes its dynamic tool registrations. */
export async function disconnectMcpForWindow(webContentsId: number, mcpId: number): Promise<void> {
  const k = key(webContentsId, mcpId);
  const managed = clients.get(k);
  if (!managed) return;
  clients.delete(k);
  for (const name of managed.registeredTools) unregisterTool(name);
  try {
    await managed.client.close();
  } catch (err) {
    log.warn('MCP client close failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    await managed.transport.close();
  } catch (err) {
    log.warn('MCP transport close failed', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
  log.info('MCP disconnected', { webContentsId, mcpId });
}

/** Closes every MCP connection owned by one window. */
export async function disconnectAllForWindow(webContentsId: number): Promise<void> {
  const prefix = `${webContentsId}:`;
  for (const k of Array.from(clients.keys()).filter((item) => item.startsWith(prefix))) {
    const mcpId = Number(k.slice(prefix.length));
    if (!Number.isNaN(mcpId)) await disconnectMcpForWindow(webContentsId, mcpId);
  }
}

/** Calls a tool through the shared approval gate bound to the caller's window. */
export async function callMcpTool(
  webContentsId: number,
  mcpId: number,
  toolName: string,
  args: Record<string, unknown>,
  scope?: RunScope,
): Promise<ExecutionResult<unknown>> {
  const managed = clients.get(key(webContentsId, mcpId));
  if (!managed || managed.status !== 'connected') throw new Error('MCP server is not connected');
  if (!managed.tools.includes(toolName)) throw new Error('MCP tool not found');
  return await executeWithApproval<unknown>(
    { type: 'mcp_tool', target: `${mcpId}:${toolName}`, reason: 'استدعاء أداة MCP' },
    async () => await managed.client.callTool({
      name: toolName,
      ...(Object.keys(args).length > 0 ? { arguments: args } : {}),
    }),
    scope,
  );
}

export interface ConnectedMcpTool {
  readonly mcpId: number;
  readonly serverName: string;
  readonly toolName: string;
  readonly description: string;
}

/** Tools currently connected in one window — bounded for prompt safety. */
export function listConnectedMcpToolsForWindow(webContentsId: number): ReadonlyArray<ConnectedMcpTool> {
  const prefix = `${webContentsId}:`;
  const result: ConnectedMcpTool[] = [];
  for (const [k, managed] of clients) {
    if (!k.startsWith(prefix) || managed.status !== 'connected') continue;
    const mcpId = Number(k.slice(prefix.length));
    if (Number.isNaN(mcpId)) continue;
    for (const toolName of managed.tools.slice(0, 6)) {
      result.push({ mcpId, serverName: managed.serverName, toolName, description: `${managed.serverName}: ${toolName}` });
    }
  }
  return result.slice(0, 12);
}

/** Live connection state for one window/server pair. */
export function getMcpRuntimeStatus(webContentsId: number, mcpId: number): McpRuntimeStatus {
  const managed = clients.get(key(webContentsId, mcpId));
  if (!managed) return { status: 'stopped', toolCount: 0, tools: [] };
  return {
    status: managed.status, toolCount: managed.tools.length, tools: [...managed.tools],
    ...(managed.error === null ? {} : { error: managed.error }),
  };
}
