CREATE TABLE beta_access_next (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO beta_access_next (email, label, enabled, user_id, created_at, updated_at)
SELECT email, label, enabled, user_id, created_at, updated_at
FROM beta_access;

DROP TABLE beta_access;
ALTER TABLE beta_access_next RENAME TO beta_access;

CREATE INDEX beta_access_user_id_idx ON beta_access(user_id);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '21', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
