// End-to-end test of the Electron shell with a tiny fixture page (no Nuxt needed). Also spike S1 (Khmer rendering/PDF).
// Usage: npm run build -w desktop && node desktop/test/e2e-shell.mjs
import { _electron as electron } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktop = path.join(root, 'desktop');
const fixture = path.join(desktop, 'test', 'fixture-web');
const outDir = path.join(desktop, 'test', 'out');
const electronExe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
mkdirSync(path.join(fixture, 'fonts'), { recursive: true });
mkdirSync(outDir, { recursive: true });
for (const w of ['400', '700']) copyFileSync(path.join(desktop, 'dist', 'static', 'fonts', `noto-sans-khmer-${w}.woff2`), path.join(fixture, 'fonts', `noto-sans-khmer-${w}.woff2`));

let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataRoot = mkdtempSync(path.join(tmpdir(), 'sms shell ទិន្នន័យ '));
const cleanEnv = (extra = {}) => { const e = { ...process.env, SMS_WEB_ROOT: fixture, ...extra }; delete e.ELECTRON_RUN_AS_NODE; return e; };
const strayElectron = () => { try { return execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${root}\\node_modules\\*' }).Id`], { encoding: 'utf8' }).split(/\s+/).filter(Boolean); } catch { return []; } };
const killStrays = () => { for (const p of strayElectron()) { try { execFileSync('taskkill', ['/F', '/PID', p], { stdio: 'ignore' }); } catch { /* gone */ } } };
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };

async function mainPage(app, ms = 120_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const w of app.windows()) if (w.url().startsWith('app://school')) { await w.waitForLoadState('domcontentloaded'); return w; }
    await sleep(250);
  }
  throw new Error('main window did not appear');
}

const A = path.join(dataRoot, 'a');
killStrays();
let app, page;
try {
  // ========== 1. normal start ==========
  const t0 = Date.now();
  app = await electron.launch({ executablePath: electronExe, args: [desktop], env: cleanEnv({ SMS_DATA_DIR: A }), timeout: 120_000 });
  page = await mainPage(app);
  console.log(`      cold start to main window: ${Date.now() - t0} ms (Electron + backend, this PC)`);
  check('1a main window loads from app://school/ (custom protocol)', page.url() === 'app://school/', page.url());

  const surface = await page.evaluate(() => ({
    keys: Object.keys(window.desktop ?? {}).sort(),
    require: typeof window.require, process: typeof window.process, ipc: typeof window.ipcRenderer, electron: typeof window.electron,
  }));
  check('1b preload exposes only the documented desktop API', JSON.stringify(surface.keys) === JSON.stringify(['getInfo', 'health', 'metrics', 'onBackendStatus', 'openLogsFolder', 'printCurrentPage', 'printers', 'quit', 'restartBackend', 'saveFile', 'savePdfOfCurrentPage']), surface.keys.join(','));
  check('1c no Node/Electron globals leak into the page (require/process/ipcRenderer)', surface.require === 'undefined' && surface.process === 'undefined' && surface.ipc === 'undefined' && surface.electron === 'undefined', JSON.stringify(surface));

  const info = await page.evaluate(() => window.desktop.getInfo());
  check('1d getInfo returns the loopback backend URL', /^http:\/\/127\.0\.0\.1:\d+$/.test(info.backendBaseUrl), `${info.backendBaseUrl} v${info.version}`);

  const net = await page.evaluate(async (base) => {
    const r = { };
    r.withInjectedSecret = (await fetch(base + '/internal/health')).status;                     // page sends NO secret itself
    r.sameOriginPage = (await fetch(location.href)).status;
    r.csp = (await fetch(location.href)).headers.get('content-security-policy');
    try { await fetch('https://example.com/'); r.external = 'ALLOWED'; } catch { r.external = 'blocked'; }
    try { await fetch('http://127.0.0.1:1/'); r.otherLocal = 'ALLOWED'; } catch { r.otherLocal = 'blocked'; }
    try { r.evalResult = String(eval('1+1')); } catch (e) { r.evalResult = 'blocked'; }
    try { r.popup = String(window.open('https://example.com') === null ? 'denied' : 'OPENED'); } catch { r.popup = 'denied'; }
    return r;
  }, info.backendBaseUrl);
  check('1e Electron injects the launch secret: the page reaches /internal/health without knowing it (200)', net.withInjectedSecret === 200);
  check('1f CSP header present with connect-src limited to self + this backend', !!net.csp && net.csp.includes(`connect-src 'self' ${info.backendBaseUrl}`) && net.csp.includes("default-src 'none'"), (net.csp ?? '').slice(0, 90) + '…');
  check("1g CSP forbids 'unsafe-eval' (eval blocked), external hosts and other local ports", net.evalResult === 'blocked' && net.external === 'blocked' && net.otherLocal === 'blocked', JSON.stringify({ eval: net.evalResult, ext: net.external, other: net.otherLocal }));
  check('1h window.open is denied', net.popup === 'denied');

  const navBefore = page.url();
  await page.evaluate(() => { location.href = 'https://example.com/'; });
  await sleep(1500);
  check('1i navigation away from the app is blocked', page.url() === navBefore, page.url());

  const outsideSecret = await fetch(info.backendBaseUrl + '/internal/health').then((r) => r.status);
  check('1j the same request from OUTSIDE Electron (no secret) is refused (403)', outsideSecret === 403, String(outsideSecret));

  // ---------- spike S1: Khmer rendering, fonts, collation ----------
  const s1 = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((f) => `${f.family}:${f.weight}:${f.status}`);
    const names = ['ឃ', 'ក', 'គ', 'ខ', 'ង', 'ច', 'ឆ', 'ជ', 'ដ', 'ត', 'ប', 'ម', 'ស', 'អ'];
    const sorted = [...names].sort(new Intl.Collator('km').compare);
    const people = ['ឈួន សុវណ្ណារ៉ា', 'គឹម សុខា', 'ខៀវ ស្រីពៅ', 'ស៊ុន ចាន់ថា'].sort(new Intl.Collator('km').compare);
    const wrap = document.getElementById('wrap');
    const lineHeight = parseFloat(getComputedStyle(wrap).lineHeight);
    const supp = { collator: Intl.Collator.supportedLocalesOf(['km']).length > 0, datetime: Intl.DateTimeFormat.supportedLocalesOf(['km']).length > 0, number: Intl.NumberFormat.supportedLocalesOf(['km']).length > 0 };
    return { supp, check: document.fonts.check('16px SmsKhmerTest'), faces, sorted: sorted.join(''), people, collatorLocale: new Intl.Collator('km').resolvedOptions().locale,
      wrapHeight: wrap.getBoundingClientRect().height, lineHeight, computedFamily: getComputedStyle(document.body).fontFamily };
  });
  check('S1a unique-named bundled Khmer font loaded from the app (not a system font)', s1.check && s1.faces.some((f) => f.startsWith('SmsKhmerTest') && f.endsWith('loaded')), s1.faces.join(' '));
  check('S1b Intl.Collator sorts Khmer consonants in alphabet order (root collation; Chromium has no km tailoring)', s1.sorted === 'កខគឃងចឆជដតបមសអ' && s1.people[0].startsWith('ខៀវ') && s1.people[3].startsWith('ស៊ុន'), `${s1.sorted} (resolved locale ${s1.collatorLocale}; supported km: collator=${s1.supp.collator} datetime=${s1.supp.datetime} number=${s1.supp.number})`);
  console.log(`      names sorted with Intl.Collator('km'): ${s1.people.join(' | ')}`);
  check('S1c Khmer wraps inside a narrow box (several lines, line-height >= 1.6 x font)', s1.wrapHeight > 3 * 27 && s1.lineHeight >= 1.6 * 16, `${Math.round(s1.wrapHeight)}px tall`);
  await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
  await page.screenshot({ path: path.join(outDir, 'khmer-fixture.png') });

  // ---------- PDF through the real IPC (save dialog stubbed in the main process) ----------
  const pdfPath = path.join(outDir, 'khmer-fixture.pdf');
  rmSync(pdfPath, { force: true });
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, pdfPath);
  const saved = await page.evaluate(() => window.desktop.savePdfOfCurrentPage({ defaultName: '../../evil name?.pdf' }));
  const pdfBytes = existsSync(pdfPath) ? readFileSync(pdfPath) : Buffer.alloc(0);
  check('S1d savePdfOfCurrentPage writes a real PDF through the IPC', saved.saved === true && pdfBytes.subarray(0, 5).toString() === '%PDF-', `${pdfBytes.length} bytes → ${pdfPath}`);

  const rawPrinter = await app.evaluate(async ({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().startsWith('app://')); const p = await w.webContents.getPrintersAsync(); return p.map((x) => ({ name: x.name, keys: Object.keys(x), options: x.options })); });
  console.log(`      raw printer info (to find the default-printer flag): ${JSON.stringify(rawPrinter.slice(-2))}`);
  const printers = await page.evaluate(() => window.desktop.printers.list());
  console.log(`      printers seen by Electron: ${JSON.stringify(printers)}`);
  check('1k printers.list returns the Windows printers', Array.isArray(printers) && printers.length > 0 && printers.every((p) => typeof p.name === 'string' && typeof p.isDefault === 'boolean'));
  const m = await page.evaluate(() => window.desktop.metrics.get());
  console.log(`      memory right after start: ${JSON.stringify(m)}`);
  check('1l metrics.get returns working-set numbers (Electron + backend)', m.totalWorkingSetMb > 100 && m.processCount >= 3);

  // ---------- restart + status events ----------
  await page.evaluate(() => { window.__ev = []; window.__off = window.desktop.onBackendStatus((s) => window.__ev.push(s.state)); });
  await page.evaluate(() => window.desktop.restartBackend());
  const info2 = await page.evaluate(() => window.desktop.getInfo());
  const events = await page.evaluate(() => window.__ev);
  const health2 = await page.evaluate(async (b) => (await fetch(b + '/internal/health')).status, info2.backendBaseUrl);
  check('1m restartBackend brings up a new backend on the SAME port (CSP stays valid) that answers', health2 === 200 && info2.backendBaseUrl === info.backendBaseUrl, `${info.backendBaseUrl} → ${info2.backendBaseUrl}`);
  check('1n status events reach the page (stopped → starting → ready)', ['stopped', 'starting', 'ready'].every((s) => events.includes(s)), events.join(','));

  // ---------- single instance ----------
  const second = spawn(electronExe, [desktop], { env: cleanEnv({ SMS_DATA_DIR: A }), stdio: 'ignore', windowsHide: true });
  const secondExit = await Promise.race([new Promise((r) => second.on('exit', (c) => r(c))), sleep(25_000).then(() => 'STILL_RUNNING')]);
  if (secondExit === 'STILL_RUNNING') second.kill();
  check('1o a second launch exits at once (single instance lock)', secondExit !== 'STILL_RUNNING', String(secondExit));

  // ---------- graceful quit: backend stops, locks removed ----------
  const javaPid = Number(readFileSync(path.join(A, 'config', 'backend.pid'), 'utf8'));
  check('1p backend is running before quit (pid file + live process)', alive(javaPid), `pid ${javaPid}`);
  await app.close();
  await sleep(1500);
  check('1q quitting the app stops the backend (graceful)', !alive(javaPid));
  check('1r backend.pid and running.lock are removed after a clean quit', !existsSync(path.join(A, 'config', 'backend.pid')) && !existsSync(path.join(A, 'config', 'running.lock')));
  const dlog = readFileSync(path.join(A, 'logs', 'desktop.log'), 'utf8');
  check('1s desktop.log written in the data folder; no secrets in it', dlog.includes('backend ready') && !/[0-9a-f]{64}/.test(dlog));

  // ========== 2. Electron killed hard: the JVM must not survive (stdin watchdog) ==========
  // Launched directly (not through Playwright, whose debug pipes keep Chromium children alive after a force-kill).
  const B = path.join(dataRoot, 'b');
  const direct = spawn(electronExe, [desktop], { env: cleanEnv({ SMS_DATA_DIR: B }), stdio: 'ignore', windowsHide: true });
  const readyFile = path.join(B, 'config', 'backend.pid');
  for (let i = 0; i < 160; i++) { await sleep(500); if (existsSync(readyFile) && existsSync(path.join(B, 'logs', 'desktop.log')) && readFileSync(path.join(B, 'logs', 'desktop.log'), 'utf8').includes('backend ready')) break; }
  const javaPid2 = Number(readFileSync(readyFile, 'utf8'));
  check('2a second run: backend alive', alive(javaPid2), `electron ${direct.pid}, java ${javaPid2}`);
  check('2a2 sanity: the stray-process detector sees the running Electron processes', strayElectron().length >= 3, `${strayElectron().length} seen`);
  execFileSync('taskkill', ['/F', '/PID', String(direct.pid)]);                    // NOT /T: leave the child alive on purpose
  let gone = false;
  const tKill = Date.now();
  for (let i = 0; i < 40 && !gone; i++) { await sleep(250); gone = !alive(javaPid2); }
  check('2b after Electron is force-killed the backend exits on its own (no orphan JVM)', gone, `${Date.now() - tKill} ms`);
  check('2c ...and no Electron child process is left behind', strayElectron().length === 0, `${strayElectron().length} left`);

  // ========== 3. start-up failure shows the Khmer error window ==========
  const C = path.join(dataRoot, 'c');
  app = await electron.launch({ executablePath: electronExe, args: [desktop], env: cleanEnv({ SMS_DATA_DIR: C, SMS_JAVA_EXE: 'C:\\does-not-exist\\java.exe' }), timeout: 60_000 });
  let err = null;
  for (let i = 0; i < 60 && !err; i++) { err = app.windows().find((w) => w.url().endsWith('error.html')) ?? null; if (!err) await sleep(250); }
  check('3a missing Java -> the start-up error window opens', !!err);
  if (err) {
    await err.waitForLoadState('domcontentloaded');
    await err.waitForFunction(() => document.getElementById('code')?.textContent);
    const txt = await err.evaluate(() => ({ code: document.getElementById('code').textContent, msg: document.getElementById('message').textContent, buttons: [...document.querySelectorAll('button')].map((b) => b.textContent) }));
    check('3b it shows the failure code and a Khmer explanation with three buttons', txt.code === 'JAVA_MISSING' && /[\u1780-\u17FF]/.test(txt.msg) && txt.buttons.length === 3, JSON.stringify(txt));
    await err.screenshot({ path: path.join(outDir, 'error-window.png') });
    const closed = new Promise((r) => app.process().once('exit', r));
    err.evaluate(() => window.errorApi.quit()).catch(() => {});      // the page is destroyed by quitting; do not await it
    const q = await Promise.race([closed.then(() => 'exited'), sleep(15_000).then(() => 'STILL_RUNNING')]);
    check('3c the Quit button exits the app', q === 'exited', q);
    app = null;
  }
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
} finally {
  try { if (app) await app.close(); } catch { /* ignore */ }
  killStrays();
  try { rmSync(dataRoot, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
