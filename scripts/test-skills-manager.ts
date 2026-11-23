// STEP 72B skills-manager test — no API, no real DB, temp files only.

import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunScope } from '../src/types.js';
import { migrate } from '../src/memory/migrations.js';
import { setProjectSkillEnabled, upsertInstalledSkill } from '../src/memory/skills-catalog.js';
import { loadActiveInstructionSkills, parseSkillFile } from '../src/core/skills-manager.js';
import { check, finish } from './test-db-helpers.js';

function scopeFor(projectId: number | null, root: string): RunScope {
  return { kind: 'workspace', windowId: null, projectId, sessionId: null, workspaceRoot: root };
}

function makeSkillFile(dir: string, folder: string, name: string, body: string): string {
  mkdirSync(join(dir, folder), { recursive: true });
  const file = join(dir, folder, 'SKILL.md');
  writeFileSync(file, `---\nname: ${name}\ndescription: "${name} description"\n---\n\n${body}\n`, 'utf8');
  return file;
}

function main(): void {
  const dir = mkdtempSync(join(tmpdir(), 'apex-skills-manager-'));
  const db = new Database(':memory:');
  try {
    console.log('=== STEP 72B — Skills Manager Test ===\n');
    db.exec(`
      CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'planning');
      CREATE TABLE conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL,
        content TEXT NOT NULL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP);
    `);
    check('migration reaches v2', migrate(db, ':memory:') === 2);
    db.prepare("INSERT INTO projects (name) VALUES ('alpha')").run();
    db.prepare("INSERT INTO projects (name) VALUES ('beta')").run();

    const globalFile = makeSkillFile(dir, 'global-one', 'Global Skill', 'GLOBAL BODY');
    const projectAFile = makeSkillFile(dir, 'project-a', 'Project A Skill', 'PROJECT A BODY');
    const projectBFile = makeSkillFile(dir, 'project-b', 'Project B Skill', 'PROJECT B BODY');
    const parsed = parseSkillFile(
      '---\nname: Parsed Name\ndescription: "Parsed desc"\n---\n\n# Body\ntext',
      'fallback',
    );
    check('frontmatter name parsed', parsed.name === 'Parsed Name');
    check('frontmatter description parsed', parsed.description === 'Parsed desc');
    check('sha256 content hash produced', /^[0-9a-f]{64}$/.test(parsed.contentHash));

    upsertInstalledSkill(db, {
      slug: 'global-one', name: 'Global Skill', description: 'global description',
      source: 'global', scopeProjectId: null, path: globalFile,
      contentHash: 'g1', defaultEnabled: true,
    });
    const skillA = upsertInstalledSkill(db, {
      slug: 'project-a', name: 'Project A Skill', description: 'a description',
      source: 'project', scopeProjectId: 1, path: projectAFile,
      contentHash: 'a1', defaultEnabled: true,
    });
    upsertInstalledSkill(db, {
      slug: 'project-b', name: 'Project B Skill', description: 'b description',
      source: 'project', scopeProjectId: 2, path: projectBFile,
      contentHash: 'b1', defaultEnabled: true,
    });

    const forA = loadActiveInstructionSkills(db, scopeFor(1, dir));
    check('project A sees its own skill', forA.some((s) => s.name === 'Project A Skill'));
    check('project A sees global skill', forA.some((s) => s.name === 'Global Skill'));
    check('project A cannot see project B skill', !forA.some((s) => s.name === 'Project B Skill'));

    setProjectSkillEnabled(db, 1, skillA, false);
    const offA = loadActiveInstructionSkills(db, scopeFor(1, dir));
    check('OFF skill is not injected', !offA.some((s) => s.name === 'Project A Skill'));
    check('other project unaffected by OFF',
      loadActiveInstructionSkills(db, scopeFor(2, dir)).some((s) => s.name === 'Project B Skill'));
    setProjectSkillEnabled(db, 1, skillA, true);
    check('ON skill is injected again',
      loadActiveInstructionSkills(db, scopeFor(1, dir)).some((s) => s.name === 'Project A Skill'));

    for (let i = 1; i <= 8; i += 1) {
      const file = makeSkillFile(dir, `long-${i}`, `Long Skill ${i}`, `paragraph ${i}\n\n${'x'.repeat(4000)}`);
      upsertInstalledSkill(db, {
        slug: `long-${i}`, name: `Long Skill ${i}`, description: '', source: 'global',
        scopeProjectId: null, path: file, contentHash: `h${i}`, defaultEnabled: true,
      });
    }
    const capped = loadActiveInstructionSkills(db, scopeFor(1, dir));
    const total = capped.reduce((sum: number, skill): number => sum + skill.body.length, 0);
    check('at most 6 skills injected', capped.length === 6);
    check('total injection stays under 9000 chars', total <= 9000);
    check('each skill body stays under 1500 chars',
      capped.every((skill) => skill.body.length <= 1500));
    check('long bodies are marked truncated',
      capped.some((skill) => skill.body.includes('[truncated]')));
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
  finish();
}

main();
