// Cold/warm start and idle memory of the PACKAGED app, with NO debugger attached (docs §4C.2, results -> docs/PERF-LOG.md).
// Usage: node scripts/measure-app.mjs [exe] [runs=3] [idleSeconds=45]
// Run 1 starts on an empty data folder (first launch: migrations); later runs reuse it (what a user sees day to day).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const release = JSON.parse(readFileSync(path.join(root, 'release', 'release.json'), 'utf8'));
const exe = path.resolve(process.argv[2] ?? path.join(root, 'desktop', 'release', 'win-unpacked', `${release.shortName}.exe`));
const runs = Number(process.argv[3] ?? 3);
const idle = Number(process.argv[4] ?? 45);
const data = mkdtempSync(path.join(tmpdir(), 'sms-measure-'));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
const appDir = path.dirname(exe).toLowerCase();
const log = path.join(data, 'logs', 'desktop.log');

/** Working set of every process that runs from the app folder (Electron's processes and the bundled java.exe). */
function workingSet() {
  const ps = `$d='${appDir.replace(/'/g, "''")}'; $p = Get-Process | Where-Object { $_.Path -and $_.Path.ToLower().StartsWith($d) }; ` +
    `'{0}|{1}|{2}' -f ($p | Measure-Object WorkingSet64 -Sum).Sum, ($p | Measure-Object).Count, (($p | Group-Object ProcessName | ForEach-Object { $_.Name + '=' + [math]::Round(($_.Group | Measure-Object WorkingSet64 -Sum).Sum/1MB) }) -join ' ')`;
  const [sum, count, detail] = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split('|');
  return { totalMb: Math.round(Number(sum) / 1048576), processes: Number(count), byProcess: detail };
}

for (let i = 1; i <= runs; i++) {
  const from = existsSync(log) ? statSync(log).size : 0;                           // only look at what THIS run writes
  const tail = () => (existsSync(log) ? readFileSync(log).subarray(from).toString('utf8') : '');
  const t0 = Date.now();
  const child = spawn(exe, [], { env, stdio: 'ignore' });
  let shown = null;
  for (let k = 0; k < 480 && !shown; k++) { await sleep(250); shown = /main window shown (\d+) ms/.exec(tail()); }
  const wall = Date.now() - t0;
  const ready = [...tail().matchAll(/backend ready on 127\.0\.0\.1:\d+ in (\d+) ms/g)].at(-1)?.[1];
  let memory = null;
  if (i === runs) { await sleep(idle * 1000); memory = workingSet(); }
  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  execFileSync('taskkill', ['/PID', String(child.pid)], { stdio: 'ignore' });        // like the user closing the window: no /F
  let down = false;
  for (let k = 0; k < 60 && !down; k++) { await sleep(500); down = !alive(child.pid) && !alive(javaPid); }
  console.log(JSON.stringify({ run: i, kind: i === 1 ? 'first launch (empty DB)' : 'warm', windowShownMs: shown ? Number(shown[1]) : null, backendReadyMs: ready ? Number(ready) : null, wallMs: wall, closedCleanly: down, idleMemory: memory }));
}
rmSync(data, { recursive: true, force: true });
