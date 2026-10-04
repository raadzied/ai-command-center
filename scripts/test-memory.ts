import 'dotenv/config';
import { rmSync, existsSync } from 'node:fs';
import { openDb, closeDb } from '../src/memory/db.js';
import {
  saveConversation,
  saveDecision,
  saveSkill,
  createProject,
} from '../src/memory/store.js';
import { retrieveUnified } from '../src/memory/retrieve.js';
import { embed } from '../src/llm/classifier.cloud.js';

const TEST_DB = './data/test-memory.db';

async function main(): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) {
    const p = TEST_DB + suffix;
    if (existsSync(p)) rmSync(p, { force: true });
  }

  const db = openDb(TEST_DB);
  console.log('✓ DB opened');

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not set in .env');
  }

  const convTexts = [
    'ناقشنا اليوم كيف يعمل sqlite-vec داخل Node.js مع better-sqlite3.',
    'المستخدم يفضل TypeScript strict mode ولا يقبل any في الكود.',
    'قررنا استخدام node:test بدلاً من vitest بسبب مشكلة teardown على Windows.',
  ];

  const decisionTexts = [
    {
      decision: 'استخدام node:test بدلاً من vitest',
      rationale: 'vitest كان يعلّق على Node 24 + Windows بسبب pino worker thread. node:test مدمج ولا يحتاج teardown معقد.',
    },
    {
      decision: 'تثبيت Node 22 LTS بدلاً من Node 24',
      rationale: 'Node 24 على Windows فيه خلل libuv يمنع إغلاق العمليات. Node 22 LTS مستقر تمامًا.',
    },
  ];

  const skillTexts = [
    {
      name: 'TypeScript strict mode',
      category: 'typescript',
      content: 'تفعيل strict:true في tsconfig، وتجنب any، واستخدام unknown مع type guards.',
    },
    {
      name: 'sqlite-vec integration',
      category: 'database',
      content: 'تحميل sqlite-vec عبر sqliteVec.load(db)، ثم إنشاء جدول vec0 بـ FLOAT[768]، وإدخال JSON.stringify(vector).',
    },
  ];

  console.log('\n=== Saving conversations ===');
  for (const text of convTexts) {
    const vec = await embed(text);
    const id = saveConversation(db, {
      role: 'user',
      content: text,
      embedding: vec,
    });
    console.log(`  saved conv id=${id}`);
  }

  console.log('\n=== Saving decisions ===');
  const projectId = createProject(db, {
    name: 'AI Command Center',
    requirements: 'نظام ذاكرة للوكلاء',
  });
  for (const d of decisionTexts) {
    const vec = await embed(`${d.decision}: ${d.rationale}`);
    const id = saveDecision(db, {
      projectId,
      decision: d.decision,
      rationale: d.rationale,
      madeBy: 'test',
      embedding: vec,
    });
    console.log(`  saved decision id=${id}`);
  }

  console.log('\n=== Saving skills ===');
  for (const s of skillTexts) {
    const vec = await embed(s.content);
    const id = saveSkill(db, {
      name: s.name,
      category: s.category,
      content: s.content,
      proficiency: 3,
      embedding: vec,
    });
    console.log(`  saved skill id=${id}`);
  }

  console.log('\n=== Semantic search ===');

  const queries = [
    'كيف نحل مشكلة تعليق الاختبارات على ويندوز؟',
    'ما هي قواعد TypeScript في هذا المشروع؟',
    'كيف نستخدم sqlite-vec؟',
  ];

  for (const q of queries) {
    console.log(`\n🔍 Query: "${q}"`);
    const vec = await embed(q);
    const results = retrieveUnified(db, vec, 3);
    for (const r of results) {
      console.log(`  [${r.category}] dist=${r.distance.toFixed(4)} → ${r.content.slice(0, 70)}...`);
    }
  }

  closeDb();
  console.log('\n✅ ALL TESTS PASSED');
}

main().catch((err) => {
  console.error('❌ TEST FAILED:');
  console.error(err);
  process.exit(1);
});