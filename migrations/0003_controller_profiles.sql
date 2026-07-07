INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '3', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

CREATE TABLE IF NOT EXISTS controller_profiles (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  device_id TEXT,
  board_json TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '[]',
  global_transforms_json TEXT NOT NULL DEFAULT '[]',
  pattern_bindings_json TEXT NOT NULL DEFAULT '[]',
  zones_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_controller_profiles_updated_at
  ON controller_profiles(user_id, updated_at DESC);
