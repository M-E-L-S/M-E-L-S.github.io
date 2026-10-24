import { getDatabase } from '@netlify/database';
import { repository } from '../../repository.mjs';
import { createService } from '../../core.mjs';
import { createHandler } from '../../http.mjs';
let service;
export default createHandler(() => {
  if (!service) {
    const db = getDatabase();
    service = createService(repository((text, params) => db.sql.unsafe(text, params)));
  }
  return service;
}, process.env.GAME_ALLOWED_ORIGINS || '');
export const config = { path: '/api/rooms', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 180 } };
