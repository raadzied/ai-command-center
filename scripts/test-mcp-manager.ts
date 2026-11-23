// STEP 72C — MCP contracts, path confinement, approval routing (no real server).

import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb, closeDb } from '../src/memory/db.js';
import type { RunScope, ClassifiedAction } from '../src/types.js';
import { classifyAction } from '../src/security/risk-engine.js';
import { setApprovalStrategy } from '../src/security/approval.js';
import { registerTool, unregisterTool, listDynamicTools } from '../src/tools/registry.js';
import { assertEntryPath, callMcpTool } from '../src/tools/mcp-manager.js';
import { executeWithApproval } from '../src/tools/executor.js';
import { check, expectThrows, finish } from './test-db-helpers.js';

interface Captured {
  action: ClassifiedAction | null;
  scope: RunScope | undefined;
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'apex-mcp-manager-'));
  initDb(join(dir, 'test.db'));
  const captured: Captured = { action: null, scope: undefined };
  const scope: RunScope = {
    kind: 'workspace', windowId: 7, projectId: 3, sessionId: 2,
    workspaceRoot: process.cwd(),
  };
  try {
    console.log('=== STEP 72C — MCP Manager Test ===\n');

    registerTool({
      name: 'mcp.test.dynamic', description: 'temporary', riskLevel: 'executes',
      allowedAgents: [], dynamic: true,
    });
    check('dynamic tool is listed', listDynamicTools().some((t) => t.name === 'mcp.test.dynamic'));
    check('dynamic tool unregisters', unregisterTool('mcp.test.dynamic'));
    check('second unregister returns false', !unregisterTool('mcp.test.dynamic'));
    check('built-in tool cannot be unregistered', !unregisterTool('filesystem.read'));

    const outside = join(dir, 'outside.js');
    writeFileSync(outside, 'export {};\n', 'utf8');
    expectThrows('missing path is rejected', (): void => {
      assertEntryPath(join(dir, 'missing.js'));
    });
    expectThrows('path outside the app root is rejected', (): void => {
      assertEntryPath(outside);
    });

    const classified = classifyAction({
      type: 'mcp_tool', target: '1:search', reason: 'test',
    });
    check('mcp_tool is classified as review', classified.risk === 'review');

    setApprovalStrategy({
      ask: async (action: ClassifiedAction, _auditId: string, askScope?: RunScope) => {
        captured.action = action;
        captured.scope = askScope;
        return 'user_approved';
      },
    });
    const outcome = await executeWithApproval<string>(
      { type: 'mcp_tool', target: '1:search', reason: 'test' },
      async (): Promise<string> => 'ok',
      scope,
    );
    check('approval gate executed the MCP action', outcome.executed && outcome.result === 'ok');
    check('approval received mcp_tool action', captured.action?.type === 'mcp_tool');
    check('approval received the caller window scope', captured.scope === scope);

    const source = readFileSync(join(process.cwd(), 'src/tools/mcp-manager.ts'), 'utf8');
    check('callMcpTool routes through executeWithApproval',
      source.includes('executeWithApproval<unknown>'));
    check('approval action type is mcp_tool', source.includes("type: 'mcp_tool'"));
    check('no forbidden launch tokens in manager',
      !/shell:\s*true|npx|cmd\.exe/.test(source));
    check('stdio env forces ELECTRON_RUN_AS_NODE',
      source.includes("ELECTRON_RUN_AS_NODE = '1'"));
    check('bundled api-anything args avoid unsupported --no-share',
      !source.includes('--no-share') && source.includes("args: ['mcp']"));

    await expectThrowsAsync('callMcpTool refuses an unconnected server', async (): Promise<void> => {
      await callMcpTool(999, 999, 'search', {}, scope);
    });
  } finally {
    closeDb();
    rmSync(dir, { recursive: true, force: true });
  }
  finish();
}

async function expectThrowsAsync(label: string, fn: () => Promise<void>): Promise<void> {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  check(label, threw);
}

void main();
