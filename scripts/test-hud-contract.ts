import { readFileSync } from 'node:fs';
import { check, finish } from './test-db-helpers.js';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function main(): void {
  console.log('=== STEP 82C - HUD Contract Test ===\n');

  const preload = read('src/electron/preload.cjs');
  const windowTypes = read('src/electron/renderer/src/window.d.ts');
  const index = read('src/electron/renderer/src/hud/bridge/index.ts');
  const meta = read('src/electron/renderer/src/hud/bridge/agent-meta.ts');
  const pulse = read('src/electron/renderer/src/hud/bridge/consult-pulse.ts');

  check('preload exposes onAgentConsult', preload.includes('onAgentConsult'));
  check('preload subscribes to agent:consult', preload.includes("'agent:consult'"));
  check(
    'window type declares onAgentConsult',
    windowTypes.includes('onAgentConsult: (cb: (d: { from: string; to: string; topic: string }) => void) => () => void;'),
  );
  check('bridge binds consult pulse', index.includes('bindConsultPulse(app, api)'));
  check('bridge imports agent meta', index.includes("from './agent-meta'"));
  check('advisor node mapped', meta.includes("advisor: { node: 'advisor', label: 'Advisor' }"));
  check('commander node mapped', meta.includes("commander: { node: 'commander', label: 'Commander' }"));
  check('pulse subscribes', pulse.includes('api.onAgentConsult'));
  check('pulse escapes log text', pulse.includes('esc('));
  check('pulse clears timers', pulse.includes('window.clearTimeout'));

  const emoji = /[\u{1F000}-\u{1FAFF}\u{2700}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;
  const sources: Array<[string, string]> = [
    ['preload', preload],
    ['window.d.ts', windowTypes],
    ['bridge index', index],
    ['agent-meta', meta],
    ['consult-pulse', pulse],
  ];
  for (const [name, source] of sources) {
    check(`no emoji in ${name}`, !emoji.test(source));
  }

  finish();
}

main();
