import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { formatProjectBrief, refreshProjectBrief } from '../src/core/project-brief.js';
import type { ProjectBriefEntry } from '../src/core/project-brief.js';

let passed = 0;
let failed = 0;

function check(label: string, value: boolean): void {
  if (value) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

async function main(): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'apex-project-brief-'));
  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'brief-test', scripts: { build: 'tsc', test: 'node test.js' }, dependencies: { zod: '1.0.0' },
    }));
    writeFileSync(join(root, 'src', 'app.ts'), 'export const app = true;');
    writeFileSync(join(root, 'node_modules', 'x.js'), 'hidden');
    writeFileSync(join(root, '.env'), 'SECRET=value');

    const brief = await refreshProjectBrief(root);
    const paths = brief.entries.map((entry: ProjectBriefEntry): string => entry.path);
    check('includes package.json', paths.includes('package.json'));
    check('includes source file', paths.includes('src/app.ts'));
    check('excludes node_modules', !paths.some((path: string): boolean => path.startsWith('node_modules')));
    check('excludes env files', !paths.some((path: string): boolean => path.startsWith('.env')));
    check('formats within 2500 characters', formatProjectBrief(brief).length <= 2500);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log(`Result: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown): void => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
