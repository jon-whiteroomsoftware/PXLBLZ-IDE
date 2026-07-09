CREATE TABLE IF NOT EXISTS personal_libraries (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  src TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  UNIQUE (user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personal_libraries_updated_at
  ON personal_libraries(user_id, updated_at DESC);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '11', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
