CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  handle TEXT,
  email TEXT,
  email_verified INTEGER CHECK (email_verified IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_identities_user_id
  ON identities(user_id);

CREATE INDEX IF NOT EXISTS idx_identities_verified_email
  ON identities(email)
  WHERE email IS NOT NULL AND email_verified = 1;

INSERT INTO identities (
  provider,
  provider_user_id,
  user_id,
  handle,
  email,
  email_verified,
  created_at,
  updated_at
)
SELECT
  'github',
  github_user_id,
  id,
  github_login,
  NULL,
  NULL,
  created_at,
  updated_at
FROM users
WHERE github_user_id IS NOT NULL
ON CONFLICT(provider, provider_user_id) DO NOTHING;

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '2', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
