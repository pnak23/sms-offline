// Phase 6, step 8 (the part that needs no installation and no Windows restart): the PACKAGED program (desktop/release/win-unpacked/KPSMS.exe, run from the build folder with a temporary
// data folder; nothing is installed) is killed hard while it is running, the way a power cut or a crash would end it, and is started again:
//   1. the data folder is left as a hard kill leaves it (the "running" marker is still there, the backend is gone)
//   2. the next start works, reports "the previous shutdown was not clean (the data was checked, no damage found)", and every record made before the kill is still there
//   3. a backup made after the kill is read back and proved good, and a normal quit leaves the next start with no warning
// NOT covered here (they need the installed program and a real restart, i.e. D22 and the owner's permission): the installed program, a Windows restart, a real power cut.
// Usage: node desktop/test/e2e-killed.mjs [path/to/KPSMS.exe]
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const release = JSON.parse(readFileSync(path.join(root, 'release', 'release.json'), 'utf8'));
const exe = path.resolve(process.argv[2] ?? path.join(root, 'desktop', 'release', 'win-unpacked', `${release.shortName}.exe`));
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const data = mkdtempSync(path.join(tmpdir(), 'sms killed ទិន្នន័យ '));
const port = 9334;
const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const PUPIL = 'សិស្សមុនពេលបិទដោយបង្ខំ';
let failures = 0;
const check = (n, ok, d = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
const logFile = path.join(data, 'logs', 'desktop.log');
const lockFile = path.join(data, 'config', 'running.lock');
const pidFile = path.join(data, 'config', 'backend.pid');

let child = null;
let browser = null;

async function start() {
  const before = existsSync(logFile) ? readFileSync(logFile, 'utf8').length : 0;
  child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore', windowsHide: true });
  let ready = false;
  for (let i = 0; i < 240 && !ready; i++) { await sleep(500); ready = existsSync(logFile) && readFileSync(logFile, 'utf8').slice(before).includes('backend ready'); }
  if (!ready) throw new Error('the packaged program did not report ready');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for (let i = 0; i < 60 && !page; i++) { page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('app://school')); if (!page) await sleep(500); }
  if (!page) throw new Error('no window');
  return page;
}
async function quitCleanly(page) {
  const javaPid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : 0;
  const asked = await Promise.race([page.evaluate(() => window.desktop.quit()).then(() => 'answered', (e) => 'rejected: ' + String(e.message).slice(0, 100)), sleep(4000).then(() => 'no answer in 4 s')]);
  console.log(`      the quit call: ${asked}`);
  await browser.close().catch(() => {});
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(child.pid) && (javaPid === 0 || !alive(javaPid)); }
  if (!down) console.log(`      the quit did not finish: electron alive=${alive(child.pid)} java(${javaPid}) alive=${javaPid ? alive(javaPid) : 'n/a'}; last lines of desktop.log:\n        ` + readFileSync(logFile, 'utf8').trim().split('\n').slice(-8).join('\n        '));
  return down;
}

try {
  // ---- run 1: a fresh install of the data folder through the wizard, one pupil, then a hard kill -------------------------------------------------------------
  let page = await start();
  const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
  const button = (text) => page.getByRole('button', { name: text, exact: true });
  const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
  await heading(t('setup.welcome.checksTitle')).waitFor({ timeout: 60_000 });
  await button(t('common.next')).click();
  await field('displayName').fill('អ្នកគ្រប់គ្រង សុខា');
  await field('username').fill('admin.sokha');
  await field('password').fill(PW);
  await field('confirmPassword').fill(PW);
  await button(t('setup.admin.create')).click();
  await page.locator('.recovery-key-block').waitFor({ timeout: 30_000 });
  const key = (await page.locator('.recovery-key-block .recovery-key-group').allInnerTexts()).join('-');
  await page.locator('#recovery-saved').check();
  await page.locator('#recovery-retype').fill(key.split('-')[0].toLowerCase());
  await button(t('recovery.continue')).click();
  await field('nameKm').waitFor({ timeout: 30_000 });
  await field('nameKm').fill(SCHOOL);
  await button(t('common.saveAndContinue')).click();
  await page.waitForTimeout(800);
  const skipOrNext = async () => { for (const label of [t('common.skipForNow'), t('common.saveAndContinue'), t('common.next')]) { const b = button(label); if (await b.count() && await b.isEnabled().catch(() => false)) { await b.click(); return; } } };
  for (let i = 0; i < 4 && !(await button(t('setup.finish.start')).count()); i++) { await skipOrNext(); await page.waitForTimeout(700); }
  await button(t('setup.finish.start')).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await page.locator('[data-testid=dashboard-figures]').waitFor({ timeout: 30_000 });

  const rest = (method, apiPath, body, token) => page.evaluate(async ({ method, apiPath, body, token }) => {
    const info = await window.desktop.getInfo();
    const res = await fetch(`${info.backendBaseUrl}/api/v1${apiPath}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }, { method, apiPath, body, token });
  const login = await rest('POST', '/auth/login', { username: 'admin.sokha', password: PW });
  const created = await rest('POST', '/students', { nameKm: PUPIL, gender: 'FEMALE', dateOfBirth: '2019-01-01', enrollmentDate: null, classId: null, allowDuplicate: false, guardians: [] }, login.json.token);
  check('KL-1 before the kill: a pupil is recorded (so there is something to lose)', created.status === 201, `status ${created.status}`);
  const javaPid1 = Number(readFileSync(pidFile, 'utf8'));
  check('KL-2 while it runs the "running" marker exists and the backend is alive', existsSync(lockFile) && alive(javaPid1));

  await browser.close().catch(() => {});
  browser = null;
  execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });   // the program and everything it started, ended at once, no chance to clean up
  for (let i = 0; i < 40 && (alive(child.pid) || alive(javaPid1)); i++) await sleep(250);
  check('KL-3 after the hard kill the program and its backend are gone', !alive(child.pid) && !alive(javaPid1));
  check('KL-4 and the data folder is left as a power cut leaves it: the "running" marker is still there', existsSync(lockFile));

  // ---- run 2: the next start ----------------------------------------------------------------------------------------------------------------------------------
  page = await start();
  await page.locator('input[id^="field-username-"]').waitFor({ timeout: 60_000 });
  check('KL-5 the next start works (the login page is shown, the setup is not asked again)', true);
  await page.locator('input[id^="field-username-"]').fill('admin.sokha');
  await page.locator('input[id^="field-password-"]').fill(PW);
  await page.getByRole('button', { name: t('auth.login.submit'), exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await page.locator('a[href="/settings/system"]').first().click();
  await page.locator('.health-row').first().waitFor({ timeout: 30_000 });
  const dirtyRow = page.locator('.health-row').filter({ hasText: t('health.checks.DIRTY_SHUTDOWN.title') });
  await dirtyRow.waitFor({ timeout: 30_000 });
  const dirtyText = await dirtyRow.innerText();
  check('KL-6 the system health page says the previous shutdown was not clean and that the data was checked with no damage found', dirtyText.includes(t('health.checks.DIRTY_SHUTDOWN.PREVIOUS_SHUTDOWN_NOT_CLEAN')), dirtyText.replace(/\s+/g, ' ').slice(0, 140));
  const token2 = (await rest('POST', '/auth/login', { username: 'admin.sokha', password: PW })).json.token;
  const pupils = (await rest('GET', '/students', undefined, token2)).json;
  check('KL-7 the pupil recorded before the kill is still there', Array.isArray(pupils) && pupils.some((s) => s.nameKm === PUPIL), `${pupils?.length} pupil(s)`);
  await page.locator('a[href="/settings/backup"]').first().click();
  await button(t('backup.create')).waitFor({ timeout: 30_000 });
  await button(t('backup.create')).click();
  await page.locator('.toast.show', { hasText: t('backup.created') }).first().waitFor({ timeout: 60_000 });
  check('KL-8 a backup made after the kill is written, read back and proved good ("saved and checked")', true);

  check('KL-9 a normal quit stops the program and its backend and removes the "running" marker', (await quitCleanly(page)) && !existsSync(lockFile) && !existsSync(pidFile));

  // ---- run 3: after a clean quit there is no warning ---------------------------------------------------------------------------------------------------------------
  page = await start();
  await page.locator('input[id^="field-username-"]').waitFor({ timeout: 60_000 });
  await page.locator('input[id^="field-username-"]').fill('admin.sokha');
  await page.locator('input[id^="field-password-"]').fill(PW);
  await page.getByRole('button', { name: t('auth.login.submit'), exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await page.locator('a[href="/settings/system"]').first().click();
  const cleanRow = page.locator('.health-row').filter({ hasText: t('health.checks.DIRTY_SHUTDOWN.title') });
  await cleanRow.waitFor({ timeout: 30_000 });
  const cleanText = await cleanRow.innerText();
  check('KL-10 after a clean quit the next start shows "the previous shutdown was clean" and no warning', cleanText.includes(t('health.checks.DIRTY_SHUTDOWN.OK')) && !cleanText.includes(t('health.checks.DIRTY_SHUTDOWN.PREVIOUS_SHUTDOWN_NOT_CLEAN')), cleanText.replace(/\s+/g, ' ').slice(0, 120));
  check('KL-11 and that quit also stops everything', await quitCleanly(page));
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
} finally {
  try { if (browser) await browser.close(); } catch { /* gone */ }
  try { if (child && alive(child.pid)) execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* gone */ }
  await sleep(800);
  if (failures === 0) { try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ } } else console.log(`      (the data folder is kept for looking at: ${data})`);
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
