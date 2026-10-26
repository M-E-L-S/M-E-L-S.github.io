// Local integration-only host: real Netlify handler, SQL repository and PGlite.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../netlify-games/http.mjs';
import { createService } from '../netlify-games/core.mjs';
import { repository } from '../netlify-games/repository.mjs';
const require = createRequire(new URL('../netlify-games/package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
await db.exec(await readFile(new URL('../netlify-games/netlify/database/migrations/0001_rooms.sql', import.meta.url), 'utf8'));
const service = createService(repository(async (sql, params) => (await db.query(sql, params)).rows));
const handler = createHandler(() => service, process.argv[2]);
const server = createServer(async (req, res) => {
    try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await handler(new Request('http://127.0.0.1:' + server.address().port + req.url, {
            method: req.method, headers: req.headers, ...chunks.length ? { body: Buffer.concat(chunks) } : {}
        }), { ip: req.socket.remoteAddress });
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
    } catch (error) { console.error(error); res.writeHead(500); res.end(); }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port })));
