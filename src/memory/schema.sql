-- ══════════════════════════════════════════════════════
-- AI Command Center — Memory Schema
-- ══════════════════════════════════════════════════════
-- Version: 1.0 (Phase 2 — SQLite + sqlite-vec)
-- Author: AI Command Center
-- Date: 2026-09-25
-- =============================================================================

-- ---------------------------------------------------------------------------
-- المحادثات الخام (كل رسالة بين المستخدم والوكلاء)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role        TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  agent_name  TEXT,
  content     TEXT NOT NULL,
  timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conv_timestamp
  ON conversations(timestamp DESC);

-- ---------------------------------------------------------------------------
-- المشاريع
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'planning'
                CHECK (status IN ('planning','active','paused','done')),
  requirements  TEXT,
  architecture  TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- القرارات (لماذا اخترنا X بدلاً من Y)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decisions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER,
  decision      TEXT NOT NULL,
  rationale     TEXT NOT NULL,
  alternatives  TEXT,
  made_by       TEXT,
  timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_dec_project
  ON decisions(project_id);

-- ---------------------------------------------------------------------------
-- المهارات (ما تعلمه المستخدم أو اكتسبه النظام)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  category     TEXT,
  content      TEXT NOT NULL,
  proficiency  INTEGER NOT NULL DEFAULT 1
               CHECK (proficiency BETWEEN 1 AND 5),
  last_used    DATETIME,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- ملف المستخدم (key-value بسيط)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profile (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- فهارس متجهية (sqlite-vec) — 768 بُعد
-- يُحمَّل runtime via sqliteVec.load(db) في db.ts
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS skills_vec USING vec0(
  skill_id INTEGER PRIMARY KEY,
  embedding FLOAT[768]
);

CREATE VIRTUAL TABLE IF NOT EXISTS conversations_vec USING vec0(
  conversation_id INTEGER PRIMARY KEY,
  embedding FLOAT[768]
);

CREATE VIRTUAL TABLE IF NOT EXISTS decisions_vec USING vec0(
  decision_id INTEGER PRIMARY KEY,
  embedding FLOAT[768]
);