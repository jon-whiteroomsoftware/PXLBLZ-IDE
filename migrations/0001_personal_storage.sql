CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '1', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_user_id TEXT UNIQUE,
  github_login TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_patterns (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  src TEXT NOT NULL,
  controls_json TEXT NOT NULL DEFAULT '{}',
  params_json TEXT,
  settings_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personal_patterns_updated_at
  ON personal_patterns(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS personal_maps (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  dim INTEGER NOT NULL CHECK (dim IN (1, 2, 3)),
  generator TEXT NOT NULL,
  params_json TEXT NOT NULL DEFAULT '{}',
  points_json TEXT,
  source TEXT,
  grid_dims_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personal_maps_updated_at
  ON personal_maps(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS personal_settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS controller_metadata (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
