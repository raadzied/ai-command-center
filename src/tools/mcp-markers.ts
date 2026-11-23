// Explicit MCP call markers emitted by agents: [[MCP_CALL:<id>:<tool>|{"k":"v"}]]

import type { RunScope } from '../types.js';
import { throwIfAborted } from '../core/run-control.js';
import { callMcpTool } from './mcp-manager.js';
import type { ExecutionResult } from './executor.js';

const CALL_PATTERN = /\[\[MCP_CALL:(\d+):([^:|\]]+)\|([\s\S]*?)\]\]/g;
const MAX_CALLS = 3;
const MAX_OUTPUT_CHARS = 2000;

interface CallInstruction {
  readonly mcpId: number;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
}

export interface McpMarkerResult {
  cleanedContent: string;
  toolOutputs: string[];
  executedCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts markers; invalid JSON is reported before any tool runs. */
export function extractMcpCalls(text: string): CallInstruction[] {
  CALL_PATTERN.lastIndex = 0;
  const instructions: CallInstruction[] = [];
  let match: RegExpExecArray | null;
  while ((match = CALL_PATTERN.exec(text)) !== null && instructions.length < MAX_CALLS) {
    const rawId = match[1];
    const rawTool = match[2];
    const rawArgs = match[3];
    if (rawId === undefined || rawTool === undefined || rawArgs === undefined) continue;
    const mcpId = Number(rawId);
    const toolName = rawTool.trim();
    if (!Number.isInteger(mcpId) || toolName.length === 0) {
      throw new Error('MCP_CALL غير صالح: المعرّف أو اسم الأداة مفقود');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArgs);
    } catch {
      throw new Error(`MCP_CALL JSON غير صالح للأداة ${toolName}`);
    }
    if (!isRecord(parsed)) {
      throw new Error(`MCP_CALL يتطلب كائن JSON للأداة ${toolName}`);
    }
    instructions.push({ mcpId, toolName, args: parsed });
  }
  return instructions;
}

function stripMarkers(text: string): string {
  CALL_PATTERN.lastIndex = 0;
  return text.replace(CALL_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim();
}

function renderOutput(instruction: CallInstruction, result: ExecutionResult<unknown>): string {
  const payload = result.executed ? result.result : result.error ?? result.approval.decision;
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload) ?? '';
  return `[MCP ${instruction.mcpId}:${instruction.toolName}] ${text}`.slice(0, MAX_OUTPUT_CHARS);
}

/** Executes up to three approved MCP calls and returns their outputs. */
export async function processMcpMarkers(
  text: string,
  scope?: RunScope,
  signal?: AbortSignal,
): Promise<McpMarkerResult> {
  const instructions = extractMcpCalls(text);
  const cleanedContent = stripMarkers(text);
  if (instructions.length === 0) {
    return { cleanedContent, toolOutputs: [], executedCount: 0 };
  }
  const windowId = scope?.windowId;
  if (windowId === null || windowId === undefined) {
    throw new Error('لا يمكن تنفيذ MCP_CALL بدون نافذة مشروع محددة');
  }

  const toolOutputs: string[] = [];
  for (const instruction of instructions) {
    throwIfAborted(signal);
    const result = await callMcpTool(
      windowId, instruction.mcpId, instruction.toolName, instruction.args, scope,
    );
    toolOutputs.push(renderOutput(instruction, result));
  }
  return { cleanedContent, toolOutputs, executedCount: toolOutputs.length };
}
