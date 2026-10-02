-- User content: settings + diary pages (replaces IndexedDB).
-- Vectors live in Vectorize (see 0005_drop_page_embeddings).

CREATE TABLE user_settings (
  subject_id TEXT PRIMARY KEY NOT NULL,
  locale TEXT NOT NULL DEFAULT 'zh',
  paper_style TEXT NOT NULL DEFAULT 'plain',
  input_mode TEXT NOT NULL DEFAULT 'pen',
  submit_mode TEXT NOT NULL DEFAULT 'manual',
  idle_pace TEXT NOT NULL DEFAULT 'normal',
  has_committed_once INTEGER NOT NULL DEFAULT 0 CHECK (has_committed_once IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pages (
  id TEXT PRIMARY KEY NOT NULL,
  subject_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  transcription TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL DEFAULT ''
);

CREATE INDEX pages_subject_created_idx ON pages (subject_id, created_at);

CREATE TABLE page_embeddings (
  page_id TEXT PRIMARY KEY NOT NULL REFERENCES pages (id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  dims INTEGER NOT NULL,
  model TEXT NOT NULL,
  vector BLOB NOT NULL
);

CREATE INDEX page_embeddings_subject_idx ON page_embeddings (subject_id);
