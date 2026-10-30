// The REAL Nuxt UI inside the REAL Electron shell and backend (unpackaged: desktop/dist + frontend/.output/public).
// Proves the Electron-specific layer the browser walkthrough (frontend/e2e) cannot: strict CSP, app:// serving, header injection,
// the real preload, real PDF output, offline-only network traffic. Needs: npm run generate -w frontend && npm run build -w desktop.
// Usage: node desktop/test/e2e-app.mjs
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktop = path.join(root, 'desktop');
const outDir = path.join(desktop, 'test', 'out');
mkdirSync(outDir, { recursive: true });
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };

const data = mkdtempSync(path.join(tmpdir(), 'sms app ទិន្នន័យ '));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
let app, page;
const consoleErrors = [];
const requests = new Set();

const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
const button = (text) => page.getByRole('button', { name: text, exact: true });
const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
async function shot(name) { await page.screenshot({ path: path.join(outDir, `app-${name}.png`) }); }

try {
  app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop], env, timeout: 120_000 });
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('main window did not appear');
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4(01|22|29)\b/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });   // 401/422/429 are the deliberate wrong-password steps
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('request', (r) => {   // Node reports origin "null" for non-special schemes like app:, so build it by hand
    if (/^(data|blob):/.test(r.url())) return;
    const u = new URL(r.url());
    requests.add(u.protocol + '//' + u.host);
  });
  // record CSP violations from the very first script of every (re)load
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // ---- 1. the app boots under the strict CSP and starts the wizard ----
  await heading(t('setup.welcome.checksTitle')).waitFor({ timeout: 60_000 });
  await page.locator('.health-row').first().waitFor();
  const boot = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      url: location.href, lang: document.documentElement.lang,
      loadedFaces: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))],
      khmerFont: document.fonts.check('16px "Noto Sans Khmer"'),
      bodyFont: getComputedStyle(document.body).fontFamily,
      csp: window.__csp, desktop: Object.keys(window.desktop ?? {}).length,
    };
  });
  check('1a the real UI boots from app://school/ and shows the setup wizard (fresh install)', boot.url === 'app://school/setup' || boot.url.startsWith('app://school/'), boot.url);
  check('1b NO Content-Security-Policy violation while loading (script hash, fonts, styles, images, connect)', boot.csp.length === 0, boot.csp.join(' | '));
  check('1c the bundled Noto Sans Khmer font files load under CSP (font-src self)', boot.loadedFaces.some((f) => f.includes('Noto Sans Khmer')), boot.loadedFaces.join(', '));
  check('1d the real preload is present before the app starts (window.desktop)', boot.desktop >= 10, `${boot.desktop} functions`);
  const rows = await page.locator('.health-row').allInnerTexts();
  console.log(`      step 1 health rows: ${rows.length}`);
  check('1e wizard step 1 shows the live health checks from the backend (via the injected secret)', rows.length >= 8, rows.map((r) => r.replace(/\s+/g, ' ').slice(0, 40)).slice(0, 3).join(' | '));
  await shot('01-welcome');

  // ---- 2. administrator + recovery key ----
  await button(t('common.next')).click();
  await field('displayName').fill('អ្នកគ្រប់គ្រង សុខា');
  await field('username').fill('admin.sokha');
  await field('password').fill(PW);
  await field('confirmPassword').fill(PW);
  await button(t('setup.admin.create')).click();
  await page.locator('.recovery-key-block').waitFor({ timeout: 30_000 });
  const key = (await page.locator('.recovery-key-block .recovery-key-group').allInnerTexts()).join('-');
  check('2a the administrator is created through the real backend; the recovery key is shown', /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/.test(key), key.replace(/./g, (c, i) => (i < 5 ? c : '•')));
  await shot('02-recovery-key');

  // ---- 3. print page + REAL printToPDF through the preload ----
  await button(t('recovery.printOrPdf')).click();
  await page.locator('.key-sheet-key').waitFor();
  const sheetKey = (await page.locator('.key-sheet-key span').allInnerTexts()).join('-');
  check('3a the print sheet shows the same key (held in memory, not in the URL)', sheetKey === key && !page.url().includes(key.slice(0, 5)), page.url());
  const pdfPath = path.join(outDir, 'app-recovery-key.pdf');
  rmSync(pdfPath, { force: true });
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, pdfPath);
  await shot('03-print-page');
  await button(t('print.savePdf')).click();
  for (let i = 0; i < 40 && !existsSync(pdfPath); i++) await sleep(250);
  const pdf = existsSync(pdfPath) ? readFileSync(pdfPath) : Buffer.alloc(0);
  check('3b "Save as PDF" in the real UI produces a PDF through the shell', pdf.subarray(0, 5).toString() === '%PDF-', `${pdf.length} bytes`);
  await page.getByRole('button', { name: t('common.back') }).first().click().catch(() => page.goBack());

  // ---- 4. confirm the key and finish the wizard ----
  await page.locator('.recovery-key-block').waitFor();
  check('4a returning from the print page still shows the key (no re-generation)', (await page.locator('.recovery-key-block .recovery-key-group').allInnerTexts()).join('-') === key);
  await page.locator('#recovery-saved').check();
  await page.locator('#recovery-retype').fill(key.split('-')[0].toLowerCase());
  await button(t('recovery.continue')).click();
  await page.locator('#field-nameKm-input, input[id^="field-nameKm-"]').first().waitFor({ timeout: 30_000 }).catch(async () => { await shot('FAIL-after-key'); throw new Error('wizard step 4 did not appear after confirming the key'); });
  await field('nameKm').fill(SCHOOL);
  await button(t('common.saveAndContinue')).click();
  await page.waitForTimeout(800);
  const skipOrNext = async () => { for (const label of [t('common.skipForNow'), t('common.saveAndContinue'), t('common.next')]) { const b = button(label); if (await b.count() && await b.isEnabled().catch(() => false)) { await b.click(); return label; } } return null; };
  for (let i = 0; i < 4 && !(await button(t('setup.finish.start')).count()); i++) { await skipOrNext(); await page.waitForTimeout(700); }
  await button(t('setup.finish.start')).click();
  await page.locator('.app-content, main').first().waitFor({ timeout: 30_000 });
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  check('4b the wizard completes and lands on the dashboard', page.url().endsWith('/dashboard'), page.url());
  await page.locator('.header-school-name').filter({ hasText: SCHOOL }).waitFor({ timeout: 15_000 }).then(() => check('4c Khmer school name typed in the real UI is saved and shown in the header', true)).catch(() => check('4c Khmer school name shown in the header', false));
  await shot('04-dashboard');

  // ---- 5. System health page: real preload data (memory, printers) + diagnostics export ----
  await page.locator('a[href="/settings/system"]').first().click();
  await page.locator('.health-row').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const sys = await page.locator('main, .app-content').first().innerText();
  const printersRow = (await page.locator('.health-row').allInnerTexts()).some((r) => /PRINTERS|ព្រីន|ម៉ាស៊ីនបោះពុម្ព/i.test(r));
  check('5a the health page shows memory figures from the real preload (Electron + backend)', /\d+\s*MB|\d+\s*មេកាបៃ|MB/.test(sys), '');
  await button(t('health.deepCheck')).click();
  await page.waitForFunction(() => !document.body.innerText.includes('កំពុងពិនិត្យ…'), null, { timeout: 60_000 }).catch(() => {});
  const diag = path.join(outDir, 'app-diagnostics.txt');
  rmSync(diag, { force: true });
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, diag);
  const cloneProbe = await page.evaluate(async () => { try { await window.desktop.health.exportDiagnostics(new Proxy({ a: 1 }, {})); return 'accepted'; } catch (e) { return String(e.message).slice(0, 90); } });
  console.log(`      IPC with a Proxy (what a Vue reactive object is): ${cloneProbe}`);
  await button(t('health.exportDiagnostics')).click();
  for (let i = 0; i < 40 && !existsSync(diag); i++) await sleep(250);
  const diagText = existsSync(diag) ? readFileSync(diag, 'utf8') : '';
  if (!diagText) console.log('      desktop.log tail: ' + readFileSync(path.join(data, 'logs', 'desktop.log'), 'utf8').split(/\r?\n/).slice(-8).join(' | ') + ' || console: ' + consoleErrors.join(' | '));
  check('5b diagnostics export writes a file with versions + health + log tails', diagText.includes('electron') && diagText.includes('## health report') && diagText.includes('backend ready'), `${diagText.length} chars`);
  check('5c ...and it contains NO school data, username, password, recovery key or token', !diagText.includes(SCHOOL) && !diagText.includes('admin.sokha') && !diagText.includes(PW) && !diagText.includes(key) && !diagText.replace(/-/g, '').includes(key.replace(/-/g, '')), '');
  await shot('05-system-health');

  // ---- 6. lock / unlock + sign out / sign in ----
  await page.locator('.user-menu-toggle').click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: t('nav.lock') }).first().click();
  await page.locator('.lock-overlay').waitFor();
  await page.locator('.lock-overlay input[type=password]').fill('wrong-password-xx');
  await page.locator('.lock-overlay button[type=submit]').click();
  await page.locator('.lock-overlay .field-error, .lock-overlay [role=alert], .lock-overlay .invalid-feedback').first().waitFor({ timeout: 15_000 });
  await page.locator('.lock-overlay input[type=password]').fill(PW);
  await page.locator('.lock-overlay button[type=submit]').click();
  await page.locator('.lock-overlay').waitFor({ state: 'detached', timeout: 15_000 });
  check('6a lock screen rejects a wrong password and unlocks with the right one', true);
  await page.locator('.user-menu-toggle').click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: t('nav.signOut') }).first().click();
  await field('username').waitFor({ timeout: 20_000 });
  await field('username').fill('admin.sokha');
  await field('password').fill(PW);
  await button(t('auth.login.submit')).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  check('6b sign out then sign in works', true);

  // ---- 7. after a reload the in-memory session is gone (nothing persisted) ----
  await page.reload();
  await field('username').waitFor({ timeout: 30_000 });
  const stored = await page.evaluate(() => ({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage), cookie: document.cookie }));
  check('7a reload requires signing in again; nothing is stored in localStorage/sessionStorage/cookies', stored.ls.length === 0 && stored.ss.length === 0 && stored.cookie === '', JSON.stringify(stored));

  // ---- 8. whole-session audit ----
  const csp = await page.evaluate(() => window.__csp);
  const origins = [...requests].sort();
  console.log(`      request origins seen: ${origins.join(', ')}`);
  check('8a only app://school and the local backend were ever contacted (no external request)', origins.every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)), origins.join(', '));
  check('8b no CSP violation across the whole session', csp.length === 0, csp.join(' | '));
  check('8c no console errors or uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---- 9. quit through the preload; everything stops ----
  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  let down = false;
  for (let i = 0; i < 60 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('9 quit from the UI stops Electron and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { await shot('FAIL'); } catch { /* ignore */ }
} finally {
  try { if (app) await app.close(); } catch { /* ignore */ }
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${root}\\\\node_modules\\\\*' } | Stop-Process -Force`], { stdio: 'ignore' }); } catch { /* ignore */ }
  await sleep(500);
  try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
