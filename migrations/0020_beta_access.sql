CREATE TABLE IF NOT EXISTS beta_access (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  user_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('beta_access_mode', 'legacy', unixepoch())
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '20', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
