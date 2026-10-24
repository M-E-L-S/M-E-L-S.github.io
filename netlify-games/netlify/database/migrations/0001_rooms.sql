CREATE TABLE IF NOT EXISTS game_rooms (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{20}$'),
  version bigint NOT NULL DEFAULT 0,
  expires_at bigint NOT NULL,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS game_rooms_expiry ON game_rooms (expires_at);
CREATE TABLE IF NOT EXISTS game_limits (
  id text PRIMARY KEY,
  expires_at bigint NOT NULL,
  count integer NOT NULL
);
CREATE INDEX IF NOT EXISTS game_limits_expiry ON game_limits (expires_at);
REVOKE ALL ON game_rooms, game_limits FROM PUBLIC;
