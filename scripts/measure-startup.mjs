// Start-up time harness (docs §4C.2). Starts the backend N times with a given launch command and reports the time
// from spawn to the SMS_READY line. Results are meant to be pasted into docs/PERF-LOG.md.
// Usage: node scripts/measure-startup.mjs --label "fat jar" --runs 3 --cmd "<java.exe>" -- <java args ...>
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { javaExe } from './lib/jdk.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const opts = Object.fromEntries(argv.slice(0, sep < 0 ? argv.length : sep).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const javaArgs = sep < 0 ? [] : argv.slice(sep + 1);
const runs = Number(opts.runs ?? 3);
const cmd = opts.cmd ?? javaExe();
const label = opts.label ?? 'run';
const secret = crypto.randomBytes(16).toString('hex');
const dataDir = mkdtempSync(path.join(tmpdir(), 'sms-perf-'));

async function once() {
  const t0 = Date.now();
  const child = spawn(cmd, javaArgs, {
    env: { ...process.env, SMS_DATA_DIR: dataDir, SMS_LAUNCH_SECRET: secret, SMS_PARENT_STDIN: '1' },
    stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
  });
  let buf = '';
  const ready = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ timeout: true }), 120_000);
    child.stdout.on('data', (d) => {
      buf += d;
      const m = /SMS_READY (\{.*\})/.exec(buf);
      if (m) { clearTimeout(timer); resolve(JSON.parse(m[1])); }
    });
    child.on('exit', () => resolve({ exited: true }));
  });
  const wall = Date.now() - t0;
  let timings = null;
  if (ready.port) {
    try {
      timings = (await (await fetch(`http://127.0.0.1:${ready.port}/internal/health`, { headers: { 'X-SMS-Launch-Secret': secret } })).json()).startup;
      await fetch(`http://127.0.0.1:${ready.port}/internal/shutdown`, { method: 'POST', headers: { 'X-SMS-Launch-Secret': secret } });
    } catch { /* ignore */ }
  }
  await new Promise((r) => { child.on('exit', r); setTimeout(() => { child.kill(); r(); }, 15_000); });
  return { wall, timings };
}

const results = [];
for (let i = 0; i < runs; i++) results.push(await once());
rmSync(dataDir, { recursive: true, force: true });
const walls = results.map((r) => r.wall);
const last = results.at(-1).timings ?? {};
console.log(`${label}: wall-clock spawn->READY ms = [${walls.join(', ')}]  min=${Math.min(...walls)}  | last run phases: jvmBoot=${last.jvmBootMs} env=${last.environmentMs} contextRefresh=${last.contextRefreshMs} (flyway ${last.flywayMs})`);
