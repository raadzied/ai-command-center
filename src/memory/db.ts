import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger as log } from '../llm/logger.js';

// مسار الملف الحالي (يدعم كلا من ESM و CJS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// مسار schema.sql (نفس المجلد)
const SCHEMA_PATH = resolve(__dirname, 'schema.sql');

// مسار قاعدة البيانات الافتراضي: ./data/memory.db
const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'memory.db');

// يفتح قاعدة بيانات جديدة ويطبق schema
export function openDb(path: string = DEFAULT_DB_PATH): Database.Database {
  // تأكد من وجود المجلد
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    log.info('Created DB directory', { dir });
  }

  const db = new Database(path);

  // إعدادات الاتصال
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // تحميل sqlite-vec
  sqliteVec.load(db);

  // تطبيق schema (قراءة مرّة واحدة فقط)
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  log.info('DB opened', { path });
  return db;
}

// نسخة singleton للإنتاج
let _db: Database.Database | null = null;

// يهيئ الاتصال العالمي (يُستدعى مرة عند بدء التطبيق)
export function initDb(path?: string): Database.Database {
  if (_db) return _db;
  _db = openDb(path);
  return _db;
}

// يعيد الاتصال العالمي (يرمي إن لم يُهيأ)
export function getDb(): Database.Database {
  if (!_db) {
    throw new Error('DB not initialized. Call initDb() first.');
  }
  return _db;
}

// يغلق الاتصال العالمي (للاختبارات)
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    log.info('DB closed');
  }
}