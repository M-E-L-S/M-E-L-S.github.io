import { createHash, timingSafeEqual } from 'node:crypto';
import { games as defaultGames } from './registry.mjs';
export const TTL = 24 * 3600000, LEASE = 90000, RENEW = 30000;
const digest = text => createHash('sha256').update(text).digest('hex');
const validHex = (value, size) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const fail = error => { throw Object.assign(Error(error), { expected: true }); };
const viewOf = (room, seat, now) => ({ seat, joined: room.seats.map(Boolean), online: room.seats.map(value => !!value && !value.closed && value.until > now) });
function snapshot(room, seat, now, game) {
  const view = viewOf(room, seat, now);
  return { game: room.game, room: room.id, revision: room.revision, expiresAt: room.expiresAt,
    sync: `${room.revision}:${view.online.map(Number).join('')}`,
    ...game.snapshot(room.state, view) };
}
export function createService(repository, clock = Date.now, games = defaultGames) {
  return async function service(input, trustedClient) {
    try {
      if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 4096) fail('invalid_message');
      const game = typeof input.game === 'string' && Object.hasOwn(games, input.game) && games[input.game];
      if (!game) fail('unknown_game');
      if (!validHex(input.room, 20) || !validHex(input.token, 64) || !validHex(input.connection, 32)) fail('invalid_session');
      if (!['open', 'sync', 'leave', 'command'].includes(input.action)) fail('invalid_message');
      if (input.action === 'command' && (!validHex(input.requestId, 32) || !input.command || typeof input.command !== 'object' || Array.isArray(input.command) || JSON.stringify(input.command).length > 512)) fail('invalid_message');
      const key = digest(input.token), operation = input.action === 'command' ? digest(JSON.stringify(input.command)) : null;
      for (let attempt = 0; attempt < (typeof game.seats === 'function' ? 8 : 4); attempt++) {
        const now = clock(), saved = await repository.get(input.room, input.action !== 'command');
        let room = saved ? structuredClone(saved.data) : null, changed = false, seat;
        if (!room) {
          if (input.action !== 'open' || input.create !== true) fail('room_not_found');
          if (!trustedClient) fail('service_unavailable');
          if (!await repository.limitCreation(digest(trustedClient), now)) fail('too_many_rooms');
          const state = game.initial(input.options);
          const seats = typeof game.seats === 'function' ? game.seats(state) : game.seats;
          if (!Number.isInteger(seats) || seats < 1 || seats > 8) fail('invalid_options');
          room = { id: input.room, game: input.game, revision: 0, expiresAt: now + TTL,
            seats: Array(seats).fill(null), state, receipts: [] };
          seat = 0; changed = true;
        } else {
          if (room.game !== input.game) fail('room_not_found');
          if (room.expiresAt <= now) fail('room_expired');
          seat = room.seats.findIndex(value => value && same(value.key, key));
        }
        if (input.action === 'open') {
          if (seat === -1) {
            if (input.create) fail('room_exists');
            seat = game.emptySeat ? game.emptySeat(room.state, room.seats) : room.seats.indexOf(null);
            if (seat === -1) fail('room_full');
            ++room.revision; changed = true;
          }
          const previous = room.seats[seat];
          if (!previous || previous.connection !== input.connection || previous.closed || now - previous.renewed >= RENEW) {
            room.seats[seat] = { key, connection: input.connection, until: now + LEASE, renewed: now,
              closed: false, rateAt: previous?.rateAt || now, count: previous?.count || 0 };
            changed = true;
          }
        } else {
          if (seat === -1) fail('invalid_session');
          const identity = room.seats[seat];
          if (identity.connection !== input.connection || identity.closed) fail('session_replaced');
          if (input.action === 'leave') { identity.closed = true; identity.until = 0; changed = true; }
          else {
            if (input.action === 'command') {
              const receipt = room.receipts.find(value => value.id === input.requestId);
              if (receipt) {
                if (!same(receipt.key, key) || receipt.operation !== operation) fail('operation_conflict');
                return { ok: true, replayed: true, now, state: snapshot(room, seat, now, game) };
              }
              const bad = error => ({ ok: false, error, now, state: snapshot(room, seat, now, game) });
              if (input.revision !== room.revision && !(Number.isSafeInteger(input.revision) && input.revision >= 0 && input.revision < room.revision
                && game.acceptsStale?.(room.state, input.command))) return bad('stale_state');
              if (now - identity.rateAt >= 10000) { identity.rateAt = now; identity.count = 0; }
              if (identity.count >= 20) return bad('too_many_operations');
              try { game.apply(room.state, input.command, viewOf(room, seat, now)); }
              catch (error) { if (error.expected) return bad(error.message); throw error; }
              ++identity.count; ++room.revision;
              room.receipts.push({ id: input.requestId, operation, key });
              room.receipts = room.receipts.slice(-32); changed = true;
            }
            if (now - identity.renewed >= RENEW || input.action === 'command') {
              identity.until = now + LEASE; identity.renewed = now; changed = true;
            }
          }
        }
        if (changed && !await repository.commit(input.room, saved?.version ?? null, room)) continue;
        const state = snapshot(room, seat, now, game);
        return input.action === 'sync' && input.sync === state.sync
          ? { ok: true, unchanged: true, now, expiresAt: room.expiresAt, sync: state.sync }
          : { ok: true, now, state };
      }
      return { ok: false, error: 'room_busy' };
    } catch (error) {
      if (error.expected) return { ok: false, error: error.message };
      throw error;
    }
  };
}
