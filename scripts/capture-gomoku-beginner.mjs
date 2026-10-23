// Capture reproducible native expectations for the browser's beginner C ABI.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

if (!process.argv[2]) throw new Error('usage: node scripts/capture-gomoku-beginner.mjs <native gomoku executable>');
const engine = resolve(process.argv[2]);
const cases = [];
const positions = [
    { id:'ranking', moves:[[7,7],[8,7],[7,8],[6,6]], seeds:[...Array(12).keys(), 0xFFFFFFFF] },
    { id:'forced-defense', moves:[[0,7],[1,7],[12,0],[2,7],[12,2],[3,7],[12,4],[4,7]], seeds:[0,1,2] },
    { id:'immediate-win', moves:[[1,7],[0,7],[2,7],[12,0],[3,7],[12,2],[4,7],[12,4]], seeds:[0,1,2] }
];
for (const position of positions) for (const seed of position.seeds) {
    const limits = { depth:2, nodes:0, soft_ms:0, hard_ms:60000, beginner:true, beginner_seed:seed };
    const expected = JSON.parse(execFileSync(engine, ['analyze', '--beginner', '--beginner-seed', String(seed),
        '--moves', position.moves.map(move=>move.join(',')).join(';'), '--depth','2','--nodes','0','--soft-ms','0','--hard-ms','60000'],
        { encoding:'utf8', timeout:65000 }));
    cases.push({ id:`${position.id}-${seed}`, moves:position.moves, limits, expected });
}
writeFileSync(new URL('fixtures/gomoku-beginner.json',import.meta.url), JSON.stringify({schema:1,
    native_engine_sha256:createHash('sha256').update(readFileSync(engine)).digest('hex'), cases},null,2)+'\n');
console.log(`Captured ${cases.length} native beginner fixtures`);
