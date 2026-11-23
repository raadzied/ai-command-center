import type Database from 'better-sqlite3';

/**
 * v2 — كتالوجات المهارات التعليمية وخوادم MCP.
 * المهارات هنا (`installed_skills`) نصية بحتة ومنفصلة عن `skills` المستخدمة للـ RAG.
 * `project_id IS NULL` = الحاوية العامة/اليومية المشتركة (قرار RFC-72 #6).
 */

const V2_SQL = `
  CREATE TABLE IF NOT EXISTS installed_skills (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    slug             TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    source           TEXT NOT NULL CHECK (source IN ('bundled','global','project')),
    scope_project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    path             TEXT,
    content_hash     TEXT NOT NULL DEFAULT '',
    default_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (default_enabled IN (0,1)),
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- NULL != NULL في UNIQUE العادي: فهارس جزئية تمنع التكرار في الحاوية العامة.
  CREATE UNIQUE INDEX IF NOT EXISTS ux_installed_skills_scope
    ON installed_skills(scope_project_id, slug)
    WHERE scope_project_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_installed_skills_daily
    ON installed_skills(slug)
    WHERE scope_project_id IS NULL;
  CREATE INDEX IF NOT EXISTS idx_installed_skills_scope
    ON installed_skills(scope_project_id);

  CREATE TABLE IF NOT EXISTS project_skills (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    skill_id   INTEGER NOT NULL REFERENCES installed_skills(id) ON DELETE CASCADE,
    enabled    INTEGER NOT NULL CHECK (enabled IN (0,1)),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_project_skills_scope
    ON project_skills(project_id, skill_id)
    WHERE project_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_project_skills_daily
    ON project_skills(skill_id)
    WHERE project_id IS NULL;

  CREATE TABLE IF NOT EXISTS mcp_servers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    transport       TEXT NOT NULL CHECK (transport IN ('stdio','http')),
    runtime         TEXT NOT NULL CHECK (runtime IN ('node','http')),
    entry_path      TEXT,
    args_json       TEXT NOT NULL DEFAULT '[]',
    url             TEXT,
    secret_ref      TEXT,
    config_hash     TEXT NOT NULL DEFAULT '',
    default_enabled INTEGER NOT NULL DEFAULT 0 CHECK (default_enabled IN (0,1)),
    approved_hash   TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_mcps (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    mcp_id     INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    enabled    INTEGER NOT NULL CHECK (enabled IN (0,1)),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS ux_project_mcps_scope
    ON project_mcps(project_id, mcp_id)
    WHERE project_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS ux_project_mcps_daily
    ON project_mcps(mcp_id)
    WHERE project_id IS NULL;
`;

/** تطبيق ترحيل v2 داخل معاملة Migrator الحالية (Additive فقط). */
export function migrateV2(db: Database.Database): void {
  db.exec(V2_SQL);
}
