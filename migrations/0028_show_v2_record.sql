ALTER TABLE personal_shows ADD COLUMN record_json TEXT;

CREATE TABLE personal_show_v2_migration_backups (
  user_id TEXT NOT NULL,
  show_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_row_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, show_id)
);

CREATE TABLE personal_show_v2_migration_outcomes (
  user_id TEXT NOT NULL,
  show_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version IN (1, 2)),
  status TEXT NOT NULL CHECK (status IN ('converted', 'already-v2', 'refused')),
  detail_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, show_id)
);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '28', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
