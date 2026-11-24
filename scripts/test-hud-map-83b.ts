import { readFileSync } from 'node:fs';
import { check, finish } from './test-db-helpers.js';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function main(): void {
  console.log('=== STEP 83B - Truthful HUD Map Test ===\n');

  const root = 'src/electron/renderer/src/hud/';
  const data = read(`${root}data.ts`);
  const app = read(`${root}app.ts`);
  const map = read(`${root}constellation.ts`);
  const wings = read(`${root}wings.ts`);
  const inspector = read(`${root}inspector.ts`);
  const activity = read(`${root}bridge/activity.ts`);
  const bridge = read(`${root}bridge/index.ts`);
  const pulse = read(`${root}bridge/consult-pulse.ts`);
  const css = read(`${root}hud.css`);

  check('data has no fake active nodes', !data.includes('active: true'));
  check('all seed agents start idle', (data.match(/status: 'idle'/g) ?? []).length >= 13);
  check('no fabricated startup logs', data.includes('SYSTEM_LOGS: SystemLog[] = [];'));

  check('app starts IDLE', !app.includes("coreStatus: 'THINKING'"));
  check('no local agent toggle in app', !app.includes('agent.active = !agent.active'));
  check('no fabricated dispatch log', !app.includes('Dispatched by Orchestrator'));

  check('pulses require active status', map.includes("status === 'active'"));
  check('no unconditional resource pulse', !map.includes('if (!halted)'));
  check('pulse paths marked active', map.includes('svg-pulse-amber is-active') && map.includes('svg-pulse-cyan is-active'));
  check('wings render real state classes', wings.includes('is-${agent.status}') && wings.includes('is-${resource.status}'));

  check('agent inspector shows lastActivity', inspector.includes('lastActivity') && inspector.includes('esc(last.detail)'));
  check('activity bridge subscribes', activity.includes('api.onHudActivity'));
  check('activity maps fs to filesystem', activity.includes("fs: 'filesystem'"));
  check('activity escapes detail', activity.includes('esc(detail'));
  check('activity clears timers', activity.includes('window.clearTimeout') && activity.includes('beforeunload'));
  check('bridge binds activity', bridge.includes('bindHudActivity(app, api)'));
  check('null agent resets nodes', bridge.includes("node.status = 'idle'"));
  check('consult pulse restores status', pulse.includes('savedStatus') && pulse.includes('node.status = \'active\''));

  check('idle node styles have no infinite loop', !css.includes('animation: node-cyan-pulse 2.8s'));
  check('active-only beam animation', css.includes('.svg-pulse-cyan.is-active'));

  const emoji = /[\u{1F000}-\u{1FAFF}\u{2700}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;
  const sources: Array<[string, string]> = [
    ['data', data], ['app', app], ['constellation', map], ['wings', wings],
    ['inspector', inspector], ['activity', activity], ['bridge', bridge],
    ['consult-pulse', pulse], ['hud.css', css],
  ];
  for (const [name, source] of sources) {
    check(`no emoji in ${name}`, !emoji.test(source));
  }

  finish();
}

main();
