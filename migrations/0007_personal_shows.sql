CREATE TABLE IF NOT EXISTS personal_shows (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  scenes_json TEXT NOT NULL DEFAULT '[]',
  zones_json TEXT NOT NULL DEFAULT '[]',
  cells_json TEXT NOT NULL DEFAULT '[]',
  target_controller_profile_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personal_shows_updated_at
  ON personal_shows(user_id, updated_at DESC);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '7', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
