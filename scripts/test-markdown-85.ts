import { readFileSync } from 'node:fs';
import { renderSafeMarkdown } from '../src/electron/renderer/src/hud/bridge/markdown.js';
import { check, finish } from './test-db-helpers.js';

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function main(): void {
  console.log('=== STEP 85 - Safe Markdown Test ===\n');

  const heading = renderSafeMarkdown('### ملخص');
  check('heading converted', heading.includes('<h3 class="md-h3">ملخص</h3>'));
  check('heading marker removed', !heading.includes('###'));

  const bold = renderSafeMarkdown('هذا **مهم** و*مفيد*.');
  check('bold converted', bold.includes('<strong>مهم</strong>'));
  check('italic converted', bold.includes('<em>مفيد</em>'));
  check('raw stars removed', !bold.includes('**') && !bold.includes('*مهم*'));

  const list = renderSafeMarkdown('- أول\n- ثانٍ\n1. واحد\n2. اثنان');
  check('bullet list converted', list.includes('<ul>') && list.includes('<li>أول</li>'));
  check('numbered list converted', list.includes('<ol>') && list.includes('<li>واحد</li>'));
  check('list markers removed', !list.includes('- أول') && !list.includes('1. واحد'));

  const rule = renderSafeMarkdown('قبل\n\n---\n\nبعد');
  check('horizontal rule converted', rule.includes('<hr />'));

  const code = renderSafeMarkdown('```ts\nconst x = 1;\n```');
  check('fenced code is LTR', code.includes('<pre dir="ltr"><code class="language-ts">'));
  check('fenced code content escaped', code.includes('const x = 1;'));
  check('fence markers removed', !code.includes('```'));

  const inline = renderSafeMarkdown('استخدم `npm run build` الآن');
  check('inline code is LTR', inline.includes('<code dir="ltr">npm run build</code>'));

  const xss = renderSafeMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  check('script tag escaped', xss.includes('&lt;script&gt;') && !xss.includes('<script'));
  check('img tag escaped', xss.includes('&lt;img') && !xss.includes('<img'));
  check('no executable attribute tag', !xss.includes('<img onerror'));

  const bridge = read('src/electron/renderer/src/hud/bridge/index.ts');
  const controls = read('src/electron/renderer/src/hud/controls.ts');
  const sessions = read('src/electron/renderer/src/hud/bridge/sessions.ts');

  check('response does not open drawer', !bridge.includes('showResponse') && !bridge.includes('openInspector'));
  check('response appends to thread', bridge.includes("appendChatMessage('agent'"));
  check('chat button opens thread manually', controls.includes('openChatThread(app)'));
  check('session log uses unified thread', sessions.includes('openChatThread(app, result.messages'));

  finish();
}

main();
