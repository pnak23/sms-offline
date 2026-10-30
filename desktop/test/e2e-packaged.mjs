// Runs the PACKAGED app (desktop/release/win-unpacked/SchoolManagement.exe) the way a user would: bundled JRE + backend + web
// from resources/, custom protocol, a data folder with a space and Khmer characters. Attaches over CDP only to look inside.
// Usage: node desktop/test/e2e-packaged.mjs [path/to/SchoolManagement.exe]
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const exe = path.resolve(process.argv[2] ?? path.join(root, 'desktop', 'release', 'win-unpacked', 'SchoolManagement.exe'));
const data = mkdtempSync(path.join(tmpdir(), 'sms packaged ទិន្នន័យ '));
const port = 9333;
let failures = 0;
const check = (n, ok, d = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;

let child;
try {
  check('0 packaged exe exists', existsSync(exe), exe);
  const res = path.join(path.dirname(exe), 'resources');
  check('0b resources contain jre/bin/java.exe, backend/sms-backend.jar + lib/, web/index.html',
    existsSync(path.join(res, 'jre', 'bin', 'java.exe')) && existsSync(path.join(res, 'backend', 'sms-backend.jar')) && existsSync(path.join(res, 'backend', 'lib')) && existsSync(path.join(res, 'web', 'index.html')));

  const t0 = Date.now();
  child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore', windowsHide: true });
  const log = path.join(data, 'logs', 'desktop.log');
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) { await sleep(500); ready = existsSync(log) && readFileSync(log, 'utf8').includes('backend ready'); }
  check('1 packaged app starts the bundled backend and reports ready', ready, `${Date.now() - t0} ms from launch`);

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for (let i = 0; i < 60 && !page; i++) { page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('app://school')); if (!page) await sleep(500); }
  check('2 the UI is served from the bundled web/ folder over app://school/', !!page, page?.url());
  const info = await page.evaluate(() => window.desktop.getInfo());
  const health = await page.evaluate(async (b) => (await (await fetch(b + '/internal/health')).json()), info.backendBaseUrl);
  check('3 backend healthy through the injected secret; schema version 2', health.status === 'UP' && health.schemaVersion === '2', JSON.stringify({ v: health.appVersion, startup: health.startup }));
  const jreVersion = readFileSync(path.join(res, 'jre', 'release'), 'utf8').match(/JAVA_VERSION="([^"]+)"/)?.[1];
  console.log(`      bundled JRE: ${jreVersion}`);
  const m = await page.evaluate(() => window.desktop.metrics.get());
  console.log(`      memory (packaged, idle on fixture page): ${JSON.stringify(m)}`);
  await page.keyboard.press('F12');
  await page.keyboard.press('Control+Shift+I');
  await sleep(2000);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  check('4 F12 / Ctrl+Shift+I open no DevTools window in the packaged app', !targets.some((t) => t.url.startsWith('devtools://')), targets.map((t) => t.type + ':' + t.url.slice(0, 22)).join(' '));
  const dbOk = existsSync(path.join(data, 'database', 'school.db'));
  check('5 database + logs live in the data folder (not next to the exe)', dbOk && existsSync(path.join(data, 'logs', 'backend.log')) && !existsSync(path.join(path.dirname(exe), 'database')));

  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  page.evaluate(() => window.desktop.quit()).catch(() => {});                       // ask the app to quit itself
  await browser.close().catch(() => {});
  let down = false;
  for (let i = 0; i < 60 && !down; i++) { await sleep(500); down = !alive(child.pid) && !alive(javaPid); }
  check('6 quit stops Electron and the bundled backend; locks removed', down && !existsSync(path.join(data, 'config', 'running.lock')) && !existsSync(path.join(data, 'config', 'backend.pid')));
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
} finally {
  try { if (child && alive(child.pid)) execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(500);
  try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
