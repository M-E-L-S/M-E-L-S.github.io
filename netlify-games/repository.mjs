// Each conditional write is a single PostgreSQL statement/transaction. There is
// no process-local room lock: simultaneous function instances compete in SQL.
export function repository(query) {
  return {
    async get(id, lean = false) {
      // Polls do not transfer the private operation-receipt history from DB.
      const rows = await query("SELECT version, CASE WHEN $2::boolean THEN data - 'receipts' ELSE data END AS data FROM game_rooms WHERE id = $1", [id, lean]);
      return rows.length ? { version: Number(rows[0].version), data: rows[0].data } : null;
    },
    async commit(id, version, room) {
      const rows = version === null
        ? await query('INSERT INTO game_rooms(id, version, expires_at, data) VALUES ($1, 0, $2, $3::jsonb) ON CONFLICT DO NOTHING RETURNING version', [id, room.expiresAt, JSON.stringify(room)])
        : await query("UPDATE game_rooms SET version = version + 1, expires_at = $3, data = $4::jsonb || jsonb_build_object('receipts', COALESCE($4::jsonb -> 'receipts', data -> 'receipts', '[]'::jsonb)) WHERE id = $1 AND version = $2 RETURNING version", [id, version, room.expiresAt, JSON.stringify(room)]);
      return rows.length > 0;
    },
    async limitCreation(id, now) {
      // Bounded, indexed cleanup piggybacks on a real create request. No cron
      // wakes a sleeping database and no separate housekeeping request is made.
      const rows = await query(`WITH old_rooms AS (
        DELETE FROM game_rooms WHERE id IN (SELECT id FROM game_rooms WHERE expires_at <= $2 ORDER BY expires_at LIMIT 32 FOR UPDATE SKIP LOCKED)
      ), old_limits AS (
        DELETE FROM game_limits WHERE id IN (SELECT id FROM game_limits WHERE expires_at <= $2 AND id <> $1 ORDER BY expires_at LIMIT 32 FOR UPDATE SKIP LOCKED)
      ) INSERT INTO game_limits(id, expires_at, count) VALUES ($1, $2::bigint + 3600000, 1)
      ON CONFLICT(id) DO UPDATE SET
        count = CASE WHEN game_limits.expires_at <= $2 THEN 1 ELSE game_limits.count + 1 END,
        expires_at = CASE WHEN game_limits.expires_at <= $2 THEN $2::bigint + 3600000 ELSE game_limits.expires_at END
      WHERE game_limits.expires_at <= $2 OR game_limits.count < 10 RETURNING count`, [id, now]);
      return rows.length > 0;
    }
  };
}
