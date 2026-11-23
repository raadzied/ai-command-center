// STEP 77 — MCP call marker parsing, bounds and cancellation.

import type { RunScope } from '../src/types.js';
import { extractMcpCalls, processMcpMarkers } from '../src/tools/mcp-markers.js';
import { check, expectThrows, finish } from './test-db-helpers.js';

const scope: RunScope = {
  kind: 'workspace', windowId: 42, projectId: 1, sessionId: 1,
  workspaceRoot: process.cwd(),
};

async function main(): Promise<void> {
  console.log('=== STEP 77 — MCP Markers Test ===\n');

  const parsed = extractMcpCalls('before [[MCP_CALL:1:search|{"q":"test"}]] after');
  check('marker extracted', parsed.length === 1);
  check('mcpId parsed', parsed[0]?.mcpId === 1);
  check('tool name parsed', parsed[0]?.toolName === 'search');
  check('json args parsed', parsed[0]?.args['q'] === 'test');

  expectThrows('invalid JSON is rejected', (): void => {
    extractMcpCalls('[[MCP_CALL:1:search|{bad}]]');
  });
  expectThrows('non-object JSON is rejected', (): void => {
    extractMcpCalls('[[MCP_CALL:1:search|[1,2]]]');
  });

  const many = Array.from({ length: 5 }, (_: number, i: number): string =>
    `[[MCP_CALL:1:tool${i}|{"i":${i}}]]`).join(' ');
  check('at most three calls are extracted', extractMcpCalls(many).length === 3);

  const noWindow: RunScope = {
    kind: 'workspace', windowId: null, projectId: 1, sessionId: null,
    workspaceRoot: process.cwd(),
  };
  let refusedWithoutWindow = false;
  try {
    await processMcpMarkers('[[MCP_CALL:1:search|{"q":"x"}]]', noWindow);
  } catch (err) {
    refusedWithoutWindow = err instanceof Error && err.message.includes('بدون نافذة');
  }
  check('execution refused without a window scope', refusedWithoutWindow);

  const controller = new AbortController();
  controller.abort();
  let cancelled = false;
  try {
    await processMcpMarkers('[[MCP_CALL:1:search|{"q":"x"}]]', scope, controller.signal);
  } catch (err) {
    cancelled = err instanceof Error && err.name === 'RunCancelledError';
  }
  check('aborted signal cancels before any tool call', cancelled);

  const empty = await processMcpMarkers('no markers here', scope);
  check('text without markers is returned unchanged', empty.cleanedContent === 'no markers here');
  check('no outputs when nothing executed', empty.executedCount === 0 && empty.toolOutputs.length === 0);
  finish();
}

void main();
