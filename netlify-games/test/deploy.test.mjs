import test from 'node:test';
import assert from 'node:assert/strict';
import { needsBackendBuild, ignoreBuild } from '../ignore-build.mjs';
test('frontend/docs-only commits skip backend; rules, migrations and future modules deploy', () => {
  assert.equal(needsBackendBuild(['src/site.html', 'src/scripts/game-room-client.js', 'assets/data/netlify-games.json', 'netlify-games/README.md', 'netlify-games/test/core.test.mjs']), false);
  for (const name of ['src/scripts/gomoku-model.js', 'netlify-games/games/new-game.mjs', 'netlify-games/lib/new-helper.mjs', 'netlify-games/netlify/database/migrations/0002_update.sql', 'netlify-games/netlify.toml', 'netlify-games/package-lock.json']) assert.equal(needsBackendBuild([name]), true, name);
  const env = { CACHED_COMMIT_REF: 'a'.repeat(40), COMMIT_REF: 'b'.repeat(40) };
  assert.equal(ignoreBuild(env, () => ({ status: 0, stdout: 'netlify-games/README.md\0' })), 0);
  assert.equal(ignoreBuild(env, () => ({ status: 1 })), 1);
  assert.equal(ignoreBuild({}), 1);
  assert.equal(ignoreBuild({ ...env, CACHED_COMMIT_REF: env.COMMIT_REF }), 1);
  assert.equal(ignoreBuild({ ...env, FORCE_BACKEND_DEPLOY: '1' }), 1);
});
