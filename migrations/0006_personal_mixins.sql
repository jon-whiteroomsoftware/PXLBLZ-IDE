CREATE TABLE IF NOT EXISTS personal_mixins (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('inject', 'intercept', 'bind')),
  src TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personal_mixins_updated_at
  ON personal_mixins(user_id, updated_at DESC);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '6', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
