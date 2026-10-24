import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
export function needsBackendBuild(paths) {
  return paths.some(name => name === 'src/scripts/gomoku-model.js' || name.startsWith('netlify-games/')
    && !name.startsWith('netlify-games/test/') && !['netlify-games/README.md', 'netlify-games/.gitignore'].includes(name));
}
export function ignoreBuild(env = process.env, git = spawnSync) {
  const cached = env.CACHED_COMMIT_REF, current = env.COMMIT_REF;
  // First/no-cache deployments and explicit operator retries always proceed.
  if (env.FORCE_BACKEND_DEPLOY === '1' || !/^[a-f0-9]{40,64}$/.test(cached || '')
    || !/^[a-f0-9]{40,64}$/.test(current || '') || cached === current) return 1;
  const result = git('git', ['diff', '--name-only', '-z', cached, current, '--', 'netlify-games', 'src/scripts/gomoku-model.js'],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) return 1; // Never skip on an unknown/incomplete clone.
  return needsBackendBuild(result.stdout.split('\0').filter(Boolean)) ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = ignoreBuild();
  console.log(code ? 'Building game backend.' : 'No backend changes; skipping deployment.');
  process.exitCode = code; // Netlify ignore: 0 skips, 1 builds.
}
