import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { logger as log } from '../llm/logger.js';

const MAX_DEPTH = 3;
const MAX_ENTRIES = 80;
const MAX_SNIPPET = 500;
const MAX_FORMATTED = 2500;
const EXCLUDED_FOLDERS = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', 'dist-renderer', '.next',
  'build', 'coverage', '__pycache__', '.venv',
]);

export interface ProjectBriefEntry {
  path: string;
  kind: 'file' | 'directory';
}

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

const cache = new Map<string, ProjectBrief>();

function isSecretFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('.env') || lower.endsWith('.pem') || lower.endsWith('.key');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') output[key] = item;
  }
  return output;
}

function isOutsideRoot(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}

async function readRootText(root: string, name: string): Promise<string | undefined> {
  try {
    const target = join(root, name);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) return undefined;
    const resolved = await realpath(target);
    if (isOutsideRoot(root, resolved)) {
      log.warn('Project brief root file rejected', { name });
      return undefined;
    }
    return readFile(resolved, 'utf8');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'ENOENT') log.warn('Project brief root file unavailable', { name, error });
    return undefined;
  }
}

async function readSnippet(root: string, name: string): Promise<string | undefined> {
  const text = await readRootText(root, name);
  return text?.replace(/\s+/g, ' ').trim().slice(0, MAX_SNIPPET);
}

async function readPackage(root: string): Promise<Pick<ProjectBrief, 'packageName' | 'scripts' | 'dependencies'>> {
  const empty = { scripts: {}, dependencies: [] };
  try {
    const source = await readRootText(root, 'package.json');
    if (source === undefined) return empty;
    const value: unknown = JSON.parse(source);
    if (!isRecord(value)) return empty;
    const scripts = stringMap(value['scripts']);
    const deps = { ...stringMap(value['dependencies']), ...stringMap(value['devDependencies']) };
    const dependencies = Object.keys(deps).sort().slice(0, 16);
    return {
      ...(typeof value['name'] === 'string' ? { packageName: value['name'] } : {}),
      scripts,
      dependencies,
    };
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code !== 'ENOENT') log.warn('Project brief package parse failed', { error });
    return empty;
  }
}

async function scan(root: string): Promise<ProjectBriefEntry[]> {
  const entries: ProjectBriefEntry[] = [];
  const visit = async (folder: string, depth: number): Promise<void> => {
    if (depth >= MAX_DEPTH || entries.length >= MAX_ENTRIES) return;
    let children: Dirent[];
    try {
      children = await readdir(folder, { withFileTypes: true });
    } catch (error) {
      log.warn('Project brief directory skipped', { folder, error });
      return;
    }
    children.sort((left: Dirent, right: Dirent): number => left.name.localeCompare(right.name));
    for (const child of children) {
      if (entries.length >= MAX_ENTRIES) break;
      if (child.isSymbolicLink()) continue;
      if (!child.isDirectory() && !child.isFile()) continue;
      const name = child.name;
      if (child.isDirectory() && EXCLUDED_FOLDERS.has(name.toLowerCase())) continue;
      if (!child.isDirectory() && isSecretFile(name)) continue;
      const fullPath = join(folder, name);
      const path = relative(root, fullPath).replace(/\\/g, '/');
      entries.push({ path, kind: child.isDirectory() ? 'directory' : 'file' });
      if (child.isDirectory()) await visit(fullPath, depth + 1);
    }
  };
  await visit(root, 0);
  return entries;
}

async function createBrief(workspaceRoot: string): Promise<ProjectBrief> {
  const root = await realpath(workspaceRoot);
  const entries = await scan(root);
  const detectedFiles = ['tsconfig.json', 'pyproject.toml', 'Cargo.toml'].filter((name: string): boolean =>
    entries.some((entry: ProjectBriefEntry): boolean => entry.path === name),
  );
  const packageInfo = await readPackage(root);
  const readmeSnippet = await readSnippet(root, 'README.md');
  const agentsSnippet = await readSnippet(root, 'AGENTS.md');
  return {
    workspaceRoot: root,
    generatedAt: new Date().toISOString(),
    fileCount: entries.filter((entry: ProjectBriefEntry): boolean => entry.kind === 'file').length,
    entries,
    ...packageInfo,
    detectedFiles,
    ...(readmeSnippet === undefined ? {} : { readmeSnippet }),
    ...(agentsSnippet === undefined ? {} : { agentsSnippet }),
  };
}

export async function getProjectBrief(workspaceRoot: string): Promise<ProjectBrief> {
  const root = await realpath(workspaceRoot);
  const cached = cache.get(root);
  if (cached) return cached;
  const brief = await createBrief(root);
  cache.set(root, brief);
  return brief;
}

export async function refreshProjectBrief(workspaceRoot: string): Promise<ProjectBrief> {
  const root = await realpath(workspaceRoot);
  cache.delete(root);
  return getProjectBrief(root);
}

export function formatProjectBrief(brief: ProjectBrief): string {
  const scripts = Object.entries(brief.scripts).map(([name, command]: [string, string]): string => `${name}: ${command}`);
  const lines = [
    `Root: ${brief.workspaceRoot}`,
    `Files indexed: ${brief.fileCount}`,
    ...(brief.packageName ? [`Package: ${brief.packageName}`] : []),
    ...(brief.detectedFiles.length > 0 ? [`Detected: ${brief.detectedFiles.join(', ')}`] : []),
    ...(scripts.length > 0 ? ['Scripts:', ...scripts.map((item: string): string => `- ${item}`)] : []),
    ...(brief.dependencies.length > 0 ? [`Dependencies: ${brief.dependencies.join(', ')}`] : []),
    'Tree:',
    ...brief.entries.map((entry: ProjectBriefEntry): string => `- ${entry.kind === 'directory' ? '[dir]' : '[file]'} ${entry.path}`),
    ...(brief.readmeSnippet ? [`README: ${brief.readmeSnippet}`] : []),
    ...(brief.agentsSnippet ? [`AGENTS: ${brief.agentsSnippet}`] : []),
  ];
  return lines.join('\n').slice(0, MAX_FORMATTED);
}
