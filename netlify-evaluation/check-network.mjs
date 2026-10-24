// Uses the installed curl, with explicit proxies disabled. No Netlify CLI needed.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const separator = argument.indexOf('=');
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}));
const rounds = Number(options.rounds || 12);
if (!Number.isInteger(rounds) || rounds < 1 || rounds > 100) throw Error('rounds must be 1–100');
const intervalMs = Number(options.interval || 2000);
if (!Number.isInteger(intervalMs) || intervalMs < 1000 || intervalMs > 10000) throw Error('interval must be 1000–10000 ms');
const origin = options.origin || 'https://m-e-l-s.github.io';
const base = new URL(options.site || 'https://example-hello-world-function.netlify.app');
if (base.protocol !== 'https:') throw Error('An HTTPS site is required');
const ownProbe = !!options.site;
const endpoint = ownProbe ? '/.netlify/functions/probe' : '/.netlify/functions/hello';
const records = [], began = new Date().toISOString();
const output = path.resolve(options.output || 'build/netlify-network-results.json');
async function sample(kind, index) {
  const nonce = `probe-${Date.now()}-${index}-${kind}`;
  const url = new URL(kind === 'static' ? '/' : endpoint, base);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('name', nonce);
  const args = ['--noproxy', '*', '--ipv4', '--connect-timeout', '6', '--max-time', '12',
    '--silent', '--show-error', '--include', '--header', 'Cache-Control: no-cache',
    '--write-out', '\n__CURL_METRICS__%{json}'];
  if (options.interface) args.push('--interface', options.interface);
  if (kind !== 'static') args.push('--header', `Origin: ${origin}`);
  if (kind === 'post') args.push('--request', 'POST', '--header', 'Content-Type: application/json',
    '--data', JSON.stringify({ nonce, move: [7, 7] }));
  if (kind === 'options') args.push('--request', 'OPTIONS',
    '--header', 'Access-Control-Request-Method: POST',
    '--header', 'Access-Control-Request-Headers: content-type');
  args.push(url.href);
  const result = await new Promise(resolve => {
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', error => resolve({ exitCode: -1, stdout, stderr: error.message }));
    child.on('close', exitCode => resolve({ exitCode, stdout, stderr }));
  });
  const marker = result.stdout.lastIndexOf('\n__CURL_METRICS__');
  let metrics = {};
  if (marker >= 0) { try { metrics = JSON.parse(result.stdout.slice(marker + 17)); } catch {} }
  const response = marker < 0 ? result.stdout : result.stdout.slice(0, marker);
  const headerEnd = response.indexOf('\r\n\r\n');
  const headers = response.slice(0, headerEnd), body = response.slice(headerEnd + 4);
  const header = key => headers.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))?.[1]?.trim() || null;
  const echoed = ownProbe ? (() => { try { const data = JSON.parse(body); return data.ok === true && data.source === 'netlify-function' && data.nonce === nonce && Number.isFinite(data.at); } catch { return false; } })()
    : body.trim() === `Hello ${nonce}!`;
  const httpOK = metrics.http_code >= 200 && metrics.http_code < 300;
  const allowOrigin = header('Access-Control-Allow-Origin');
  const corsOK = allowOrigin === origin || allowOrigin === '*';
  const preflightOK = corsOK && /(?:^|,|\s)POST(?:,|\s|$)/i.test(header('Access-Control-Allow-Methods') || '')
    && /(?:^|,|\s)content-type(?:,|\s|$)/i.test(header('Access-Control-Allow-Headers') || '');
  return { kind, index, at: new Date().toISOString(), exitCode: result.exitCode,
    status: metrics.http_code || 0, remote: metrics.remote_ip || null,
    dnsMs: Math.round((metrics.time_namelookup || 0) * 1000),
    tlsMs: Math.round((metrics.time_appconnect || 0) * 1000),
    ttfbMs: Math.round((metrics.time_starttransfer || 0) * 1000),
    totalMs: Math.round((metrics.time_total || 0) * 1000),
    httpOK, payloadOK: kind === 'static' || kind === 'options' ? null : echoed,
    corsOK: kind === 'static' ? null : kind === 'options' ? preflightOK : corsOK,
    headers: { allowOrigin, cacheControl: header('Cache-Control'), cacheStatus: header('Cache-Status'),
      requestId: header('X-Nf-Request-Id'), type: header('Content-Type') },
    error: result.stderr.trim() || null };
}
for (let index = 0; index < rounds; index++) {
  const kinds = ['static', 'get', 'post', ...(index % 3 === 0 ? ['options'] : [])];
  records.push(...await Promise.all(kinds.map(kind => sample(kind, index))));
  console.log(`Round ${index + 1}/${rounds}: ${records.slice(-kinds.length).map(r => `${r.kind}=${r.status}/${r.totalMs}ms${r.payloadOK === false ? '/bad-payload' : ''}`).join(' ')}`);
  if (index + 1 < rounds) await new Promise(resolve => setTimeout(resolve, intervalMs));
}
const percentile = (values, ratio) => values.sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1] ?? null;
const summary = Object.fromEntries(['static', 'get', 'post', 'options'].map(kind => {
  const group = records.filter(record => record.kind === kind);
  const success = group.filter(record => record.exitCode === 0 && record.httpOK && record.payloadOK !== false);
  return [kind, { samples: group.length, successful: success.length,
    corsPassed: group.filter(record => record.corsOK).length,
    medianMs: percentile(success.map(record => record.totalMs), .5),
    p95Ms: percentile(success.map(record => record.totalMs), .95),
    maxMs: success.length ? Math.max(...success.map(record => record.totalMs)) : null }];
}));
const report = { began, ended: new Date().toISOString(), site: base.origin,
  rounds, intervalMs,
  proxy: 'curl --noproxy *; routing, VPN/TUN and upstream ISP are outside this script',
  boundInterface: options.interface ? 'explicit local interface address (not recorded)' : null,
  origin, ownProbe, summary, records };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
console.log(`Saved ${output}`);
