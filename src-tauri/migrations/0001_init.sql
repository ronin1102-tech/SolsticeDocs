-- SolsticeDocs schema v1 (PRAGMA user_version = 1)
-- Hash lineage note (Vesper brief DOCS-03-WRITE): rewritten docs get parent_hash;
-- added now so the write path later needs no migration.

CREATE TABLE IF NOT EXISTS documents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path    TEXT NOT NULL,
    hash_sha256  TEXT NOT NULL UNIQUE,
    parent_hash  TEXT,
    title        TEXT NOT NULL DEFAULT '',
    metadata     TEXT NOT NULL DEFAULT '{}',   -- JSON
    last_page    INTEGER NOT NULL DEFAULT 1,
    zoom         REAL NOT NULL DEFAULT 1.0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_hash    TEXT NOT NULL REFERENCES documents(hash_sha256) ON DELETE CASCADE,
    type        TEXT NOT NULL,                 -- highlight | underline | margin_note | textbox
    coordinates TEXT NOT NULL DEFAULT '[]',    -- JSON, page-relative
    color       TEXT NOT NULL DEFAULT '#3B82F6',
    note_text   TEXT NOT NULL DEFAULT '',
    page        INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_annotations_doc ON annotations(doc_hash, page);

CREATE TABLE IF NOT EXISTS coursework (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_name TEXT NOT NULL,
    semester    TEXT NOT NULL DEFAULT '',
    priority    INTEGER NOT NULL DEFAULT 0,
    parent_id   INTEGER REFERENCES coursework(id) ON DELETE CASCADE
);
