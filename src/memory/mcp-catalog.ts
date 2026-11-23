// Catalogue for MCP servers and per-project ON/OFF overrides.
// Secrets are never stored: only `secret_ref` (an env var name) is persisted.

import { z } from 'zod';
import type Database from 'better-sqlite3';
import { logger as log } from '../llm/logger.js';

const SECRET_HINT = /(?:api[_-]?key|token|secret|password|passwd|authorization|bearer)\s*[=:]/i;
const SECRET_PREFIX = /^(?:sk-|gh[pousr]_|xox[baprs]-)/i;
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

const ArgSchema = z.string().min(1).max(500)
  .refine((value: string): boolean => !SECRET_HINT.test(value), 'argument looks like a secret')
  .refine((value: string): boolean => !SECRET_PREFIX.test(value), 'argument looks like a credential');
const ArgsSchema = z.array(ArgSchema).max(64);

export type McpTransport = 'stdio' | 'http';
export type McpRuntime = 'node' | 'http';

export interface McpServerInput {
  readonly slug: string;
  readonly name: string;
  readonly transport: McpTransport;
  readonly runtime: McpRuntime;
  readonly args: readonly string[];
  readonly entryPath?: string | null;
  readonly url?: string | null;
  readonly secretRef?: string | null;
  readonly configHash: string;
  readonly defaultEnabled?: boolean;
}

export interface McpServerRecord {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly transport: McpTransport;
  readonly runtime: McpRuntime;
  readonly entryPath: string | null;
  readonly args: string[];
  readonly url: string | null;
  readonly secretRef: string | null;
  readonly configHash: string;
  readonly defaultEnabled: boolean;
  readonly approvedHash: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectMcpView extends McpServerRecord {
  readonly effectiveEnabled: boolean;
  readonly hasOverride: boolean;
}

interface McpRow {
  readonly id: number; readonly slug: string; readonly name: string;
  readonly transport: McpTransport; readonly runtime: McpRuntime;
  readonly entryPath: string | null; readonly argsJson: string;
  readonly url: string | null; readonly secretRef: string | null;
  readonly configHash: string; readonly defaultEnabled: number;
  readonly approvedHash: string | null;
  readonly createdAt: string; readonly updatedAt: string;
  readonly overrideEnabled: number | null;
}
interface IdRow { readonly id: number; }

function projectIdOrNull(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error('Invalid project id');
  return value;
}

function safeUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('MCP URL must be http or https');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('MCP URL must not contain credentials');
  }
  for (const [key] of parsed.searchParams) {
    if (SECRET_HINT.test(`${key}=`)) throw new Error('MCP URL contains a secret parameter');
  }
  return value;
}

function validatedArgs(input: readonly string[]): string[] {
  // Throws ZodError on non-string items, empty strings or embedded secrets.
  return ArgsSchema.parse(input);
}

/** Creates or updates a server definition, keyed by unique slug. Returns its id. */
export function upsertMcpServer(db: Database.Database, input: McpServerInput): number {
  const slug = input.slug.trim();
  const name = input.name.trim();
  if (slug.length === 0 || name.length === 0) throw new Error('MCP slug/name cannot be empty');
  const args = validatedArgs(input.args);
  if (input.transport === 'stdio' && input.runtime !== 'node') {
    throw new Error('stdio transport requires node runtime');
  }
  if (input.transport === 'http' && input.runtime !== 'http') {
    throw new Error('http transport requires http runtime');
  }
  const entryPath = input.transport === 'stdio'
    ? (input.entryPath ?? '').trim() : null;
  if (input.transport === 'stdio' && (entryPath === null || entryPath.length === 0)) {
    throw new Error('stdio transport requires an absolute entry path');
  }
  const url = safeUrl(input.url);
  if (input.transport === 'http' && url === null) throw new Error('http transport requires a URL');
  const secretRef = input.secretRef?.trim() === '' ? null : (input.secretRef ?? null);
  if (secretRef !== null && !ENV_NAME.test(secretRef)) {
    throw new Error('secret_ref must be an environment variable name');
  }
  const configHash = input.configHash.trim();
  if (configHash.length === 0) throw new Error('configHash cannot be empty');
  const enabled = input.defaultEnabled === true ? 1 : 0;
  const existing = db.prepare<[string], IdRow>('SELECT id FROM mcp_servers WHERE slug = ?').get(slug);
  const tx = db.transaction((): number => {
    if (existing) {
      db.prepare(
        `UPDATE mcp_servers
         SET name = ?, transport = ?, runtime = ?, entry_path = ?, args_json = ?, url = ?,
             secret_ref = ?, config_hash = ?, default_enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(name, input.transport, input.runtime, entryPath, JSON.stringify(args),
        url, secretRef, configHash, enabled, existing.id);
      return existing.id;
    }
    const info = db.prepare(
      `INSERT INTO mcp_servers
        (slug, name, transport, runtime, entry_path, args_json, url, secret_ref,
         config_hash, default_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(slug, name, input.transport, input.runtime, entryPath, JSON.stringify(args),
      url, secretRef, configHash, enabled);
    return Number(info.lastInsertRowid);
  });
  const id = tx();
  log.info('MCP server upserted', { id, slug, transport: input.transport });
  return id;
}

function toRecord(row: McpRow): McpServerRecord {
  const raw: unknown = JSON.parse(row.argsJson);
  const args = ArgsSchema.parse(raw);
  return {
    id: row.id, slug: row.slug, name: row.name, transport: row.transport,
    runtime: row.runtime, entryPath: row.entryPath, args, url: row.url,
    secretRef: row.secretRef, configHash: row.configHash,
    defaultEnabled: row.defaultEnabled === 1, approvedHash: row.approvedHash,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

/** Lists MCP servers visible to a project, with COALESCE(override, default) state. */
export function listMcpsForProject(db: Database.Database, projectId: number | null): ProjectMcpView[] {
  const scope = projectIdOrNull(projectId);
  const rows = db.prepare<[number | null], McpRow>(
    `SELECT s.id AS id, s.slug AS slug, s.name AS name,
            s.transport AS transport, s.runtime AS runtime, s.entry_path AS entryPath,
            s.args_json AS argsJson, s.url AS url, s.secret_ref AS secretRef,
            s.config_hash AS configHash, s.default_enabled AS defaultEnabled,
            s.approved_hash AS approvedHash, s.created_at AS createdAt,
            s.updated_at AS updatedAt, ov.enabled AS overrideEnabled
     FROM mcp_servers s
     LEFT JOIN project_mcps ov ON ov.mcp_id = s.id AND ov.project_id IS ?
     ORDER BY s.name COLLATE NOCASE ASC`,
  ).all(scope);
  return rows.map((row: McpRow): ProjectMcpView => ({
    ...toRecord(row),
    hasOverride: row.overrideEnabled !== null,
    effectiveEnabled: row.overrideEnabled === null
      ? row.defaultEnabled === 1 : row.overrideEnabled === 1,
  }));
}

/** Stores or replaces the per-project ON/OFF override for one server. */
export function setProjectMcpEnabled(
  db: Database.Database,
  projectId: number | null,
  mcpId: number,
  enabled: boolean,
): void {
  const scope = projectIdOrNull(projectId);
  const flag = enabled ? 1 : 0;
  const tx = db.transaction((): void => {
    const existing = db.prepare<[number | null, number], IdRow>(
      'SELECT id FROM project_mcps WHERE project_id IS ? AND mcp_id = ?',
    ).get(scope, mcpId);
    if (existing) {
      db.prepare('UPDATE project_mcps SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(flag, existing.id);
      return;
    }
    db.prepare('INSERT INTO project_mcps (project_id, mcp_id, enabled) VALUES (?, ?, ?)')
      .run(scope, mcpId, flag);
  });
  tx();
  log.info('Project MCP override set', { projectId: scope, mcpId, enabled });
}

/** Records the config hash that the user explicitly approved for launch. */
export function markMcpApproved(db: Database.Database, mcpId: number, configHash: string): void {
  const hash = configHash.trim();
  if (hash.length === 0) throw new Error('configHash cannot be empty');
  db.prepare(
    'UPDATE mcp_servers SET approved_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(hash, mcpId);
  log.info('MCP config approved', { mcpId });
}

/** Removes a server definition; all ON/OFF overrides cascade away with it. */
export function removeMcpServer(db: Database.Database, mcpId: number): boolean {
  const result = db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(mcpId);
  const removed = result.changes > 0;
  if (removed) log.info('MCP server removed', { mcpId });
  return removed;
}
