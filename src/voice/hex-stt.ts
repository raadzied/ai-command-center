// Local offline STT through the Hex CLI — first provider in the voice chain.

import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { logger as log } from '../llm/logger.js';

const EXEC_OPTIONS = {
  shell: false, timeout: 30_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024,
} as const;

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/webm': '.webm', 'audio/wav': '.wav', 'audio/x-wav': '.wav',
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3',
  'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a',
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stderrOf(error: unknown): string {
  const raw = typeof error === 'object' && error !== null
    ? (error as { stderr?: unknown }).stderr : undefined;
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 250) : '';
}

function isFileSync(path: string): boolean {
  try { return statSync(path).isFile(); }
  catch (err) {
    log.debug('Hex path probe failed', { path, message: describe(err) });
    return false;
  }
}

export function resolveHexBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.HEX_STT === '0' || env.HEX_STT === 'false') return null;
  const override = env.HEX_CLI_PATH;
  if (override !== undefined && override.trim() !== '' && isFileSync(override)) return override;

  const names = process.platform === 'win32' ? ['hex.com', 'hex.exe'] : ['hex'];
  const pathValue = env.PATH ?? env.Path ?? '';
  for (const dir of pathValue.split(delimiter)) {
    if (dir.trim() === '') continue;
    for (const name of names) {
      const candidate = join(dir, name);
      if (isFileSync(candidate)) return candidate;
    }
  }
  return null;
}

function extractJsonText(parsed: unknown): string | null {
  if (typeof parsed === 'string') return parsed.trim();
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const key = typeof record['text'] === 'string' ? 'text' : 'transcript';
  const value = record[key];
  return typeof value === 'string' ? value.trim() : null;
}

export function parseHexOutput(stdout: string): string {
  const raw = stdout.trim();
  if (raw === '') return '';
  if (raw.startsWith('{') || raw.startsWith('[') || raw.startsWith('"')) {
    try { return extractJsonText(JSON.parse(raw) as unknown) ?? raw; }
    catch (err) {
      log.debug('Hex output is not JSON, using raw text', { message: describe(err) });
      return raw;
    }
  }
  return raw;
}

function extensionFor(mimeType?: string): string {
  return MIME_EXTENSIONS[mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''] ?? '.webm';
}

export interface HexSttDeps {
  readonly env?: NodeJS.ProcessEnv;
  readonly resolveBinary?: (env: NodeJS.ProcessEnv) => string | null;
  readonly runHex?: (binary: string, args: readonly string[], options: typeof EXEC_OPTIONS) => Promise<string>;
  readonly writeFile?: (path: string, data: Buffer) => Promise<void>;
  readonly removeFile?: (path: string) => Promise<void>;
  readonly warn?: (message: string, meta: Record<string, unknown>) => void;
  readonly tempDir?: string;
}

function invokeHex(binary: string, tempPath: string, deps: HexSttDeps): Promise<string> {
  const args = ['transcribe', '--json', '--language', 'ar', tempPath];
  if (deps.runHex) return deps.runHex(binary, args, EXEC_OPTIONS);
  return new Promise<string>((resolve, reject) => {
    execFile(binary, args, EXEC_OPTIONS, (err: Error | null, stdout: string | Buffer, stderr: string | Buffer): void => {
      if (err) {
        const failure = err instanceof Error ? err : new Error(String(err));
        Object.assign(failure, { stderr: String(stderr) });
        reject(failure); return;
      }
      resolve(String(stdout));
    });
  });
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT';
}

export async function transcribeWithHex(
  audioBuffer: Buffer,
  mimeType?: string,
  deps: HexSttDeps = {},
): Promise<string | null> {
  const env = deps.env ?? process.env;
  const resolve = deps.resolveBinary ?? resolveHexBinary;
  const binary = resolve(env);
  if (binary === null) return null;

  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempPath = join(deps.tempDir ?? tmpdir(), `hex-stt-${stamp}${extensionFor(mimeType)}`);
  const write = deps.writeFile ?? writeFile; const remove = deps.removeFile ?? unlink;
  const warn = deps.warn ?? log.warn;

  try {
    await write(tempPath, audioBuffer);
    const text = parseHexOutput(await invokeHex(binary, tempPath, deps));
    if (text === '') {
      warn('Hex STT returned an empty transcript', { bytes: audioBuffer.length });
      return null;
    }
    const wavMs = Math.round(Math.max(0, audioBuffer.length - 44) / 32);
    log.info('Hex STT succeeded', { chars: text.length, wavMs, bytes: audioBuffer.length });
    return text;
  } catch (err) {
    warn('Hex STT failed', { message: describe(err), stderr: stderrOf(err) });
    return null;
  } finally {
    try {
      await remove(tempPath);
    } catch (err) {
      if (!isMissingFile(err)) {
        warn('Hex STT temp cleanup failed', { path: tempPath, message: describe(err) });
      }
    }
  }
}
