UPDATE beta_access
SET
  email = substr(lower(email), 1, length(email) - length('@googlemail.com')) || '@gmail.com',
  updated_at = unixepoch()
WHERE substr(lower(email), -length('@googlemail.com')) = '@googlemail.com';

INSERT INTO app_metadata (key, value, updated_at)
VALUES ('schema_version', '22', unixepoch())
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
