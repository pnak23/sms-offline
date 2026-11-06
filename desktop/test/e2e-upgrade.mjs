// The program-side half of the UPGRADE test (Phase 6, steps 5 and 6; the owner approved it on 2026-11-06 with BOTH installers at version 1.0.0): it drives an INSTALLED (or packaged)
// KPSMS.exe through two short sessions, one before and one after the installer of the newer build is run over the older install.
//   node desktop/test/e2e-upgrade.mjs seed   <KPSMS.exe> --facts <facts.json> [--data <folder>]
//        first start: the first-run wizard, one pupil, then a normal quit. Writes the facts it saw (schema version, backups, the pupil) to <facts.json>.
//   node desktop/test/e2e-upgrade.mjs verify <KPSMS.exe> --facts <facts.json> [--data <folder>] [--same-schema]
//        start of the NEWER build on the same data: the program opens it, signs in, the pupil is still there, and the schema moved forward by the migration
//        (V10, the weekly timetable) with a PRE_MIGRATION backup of the OLD schema made first. With --same-schema (no migration expected) it checks that the schema did not
//        move and that no PRE_MIGRATION backup was made. A normal quit at the end.
// WITHOUT --data the program uses its own default data folder (%LOCALAPPDATA%\RuralSchoolManagement), which is what an installed program does; scripts/test-installer-upgrade.ps1
// refuses to run unless that folder does not exist. With --data a temporary folder is used (this is how the helper itself is tested against the unpacked build, without installing).
// The helper never deletes anything. It documents what it does NOT prove: both installers say 1.0.0, so this is NOT a test of a version-number upgrade.
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [mode, exeArg, ...rest] = process.argv.slice(2);
const option = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
if (!['seed', 'verify'].includes(mode) || !exeArg || !option('--facts')) { console.error('Usage: node desktop/test/e2e-upgrade.mjs seed|verify <KPSMS.exe> --facts <facts.json> [--data <folder>] [--same-schema]'); process.exit(2); }

const root = path.resolve(import.meta.dirname, '..', '..');
const exe = path.resolve(exeArg);
const factsFile = path.resolve(option('--facts'));
const dataOverride = option('--data') ? path.resolve(option('--data')) : null;
const sameSchema = rest.includes('--same-schema');
const dataDir = dataOverride ?? path.join(process.env.LOCALAPPDATA ?? '', 'RuralSchoolManagement');
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const PUPIL = 'សិស្សមុនការដំឡើងកំណែ';
const port = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, ok, d = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  - ' + d : ''}`); };
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
const logFile = path.join(dataDir, 'logs', 'desktop.log');
const pidFile = path.join(dataDir, 'config', 'backend.pid');
const lockFile = path.join(dataDir, 'config', 'running.lock');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.SMS_DATA_DIR;
if (dataOverride) env.SMS_DATA_DIR = dataOverride;   // only the helper's own test; an installed program is started with no override at all

let child = null;
let browser = null;
async function start() {
  const before = existsSync(logFile) ? readFileSync(logFile, 'utf8').length : 0;
  child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore', windowsHide: true });
  let ready = false;
  for (let i = 0; i < 360 && !ready; i++) { await sleep(500); ready = existsSync(logFile) && readFileSync(logFile, 'utf8').slice(before).includes('backend ready'); }
  if (!ready) throw new Error('the program did not report ready within 3 minutes');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for (let i = 0; i < 60 && !page; i++) { page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('app://school')); if (!page) await sleep(500); }
  if (!page) throw new Error('no window');
  return page;
}
async function quitCleanly(page) {
  const javaPid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : 0;
  await Promise.race([page.evaluate(() => window.desktop.quit()).then(() => 'answered', () => 'rejected'), sleep(4000)]);
  await browser.close().catch(() => {});
  browser = null;
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(child.pid) && (javaPid === 0 || !alive(javaPid)); }
  return down;
}
const rest_ = (page) => (method, apiPath, body, token) => page.evaluate(async ({ method, apiPath, body, token }) => {
  const info = await window.desktop.getInfo();
  const res = await fetch(`${info.backendBaseUrl}/api/v1${apiPath}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}, { method, apiPath, body, token });

try {
  if (mode === 'seed') {
    check('UP-0 the data folder does not exist yet (this is a fresh first start)', !existsSync(path.join(dataDir, 'database', 'school.db')), dataDir);
    const page = await start();
    const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
    const button = (text) => page.getByRole('button', { name: text, exact: true });
    await page.locator('h1, h2, h3').filter({ hasText: t('setup.welcome.checksTitle') }).first().waitFor({ timeout: 60_000 });
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
    const rest = rest_(page);
    const token = (await rest('POST', '/auth/login', { username: 'admin.sokha', password: PW })).json.token;
    const created = await rest('POST', '/students', { nameKm: PUPIL, gender: 'FEMALE', dateOfBirth: '2019-01-01', enrollmentDate: null, classId: null, allowDuplicate: false, guardians: [] }, token);
    check('UP-1 the older program was started on a fresh data folder, set up through its wizard, and one pupil was recorded', created.status === 201, `status ${created.status}`);
    const info = (await rest('GET', '/system/info', undefined, token)).json;
    const backups = (await rest('GET', '/backups', undefined, token)).json;
    check('UP-2 it reports its database schema version and its own version', Number.isInteger(info?.schemaVersion) && info.schemaVersion > 0, `schema ${info?.schemaVersion}, app ${info?.appVersion}`);
    const facts = { seededAt: new Date().toISOString(), exe, dataDir, schemaVersion: info.schemaVersion, appVersion: info.appVersion, pupil: PUPIL, backupKinds: (backups?.backups ?? []).map((b) => b.kind) };
    check('UP-3 a normal quit stops the program and its backend', await quitCleanly(page));
    writeFileSync(factsFile, JSON.stringify(facts, null, 2));
    console.log(`      facts written to ${factsFile}: ${JSON.stringify({ schemaVersion: facts.schemaVersion, appVersion: facts.appVersion, backupKinds: facts.backupKinds })}`);
  } else {
    const facts = JSON.parse(readFileSync(factsFile, 'utf8'));
    check('UP-4 the data folder from the first session is there (the installer did not remove it)', existsSync(path.join(dataDir, 'database', 'school.db')), dataDir);
    const page = await start();
    await page.locator('input[id^="field-username-"]').waitFor({ timeout: 120_000 });
    check('UP-5 the newer program opens the existing data: the login page is shown, the setup is NOT asked again', true);
    await page.locator('input[id^="field-username-"]').fill('admin.sokha');
    await page.locator('input[id^="field-password-"]').fill(PW);
    await page.getByRole('button', { name: t('auth.login.submit'), exact: true }).click();
    await page.waitForURL('**/dashboard', { timeout: 60_000 });
    const rest = rest_(page);
    const token = (await rest('POST', '/auth/login', { username: 'admin.sokha', password: PW })).json.token;
    const pupils = (await rest('GET', '/students', undefined, token)).json;
    check('UP-6 DATA PRESERVED: the pupil recorded before the upgrade is still there', Array.isArray(pupils) && pupils.some((s) => s.nameKm === facts.pupil), `${pupils?.length} pupil(s)`);
    const info = (await rest('GET', '/system/info', undefined, token)).json;
    const backups = ((await rest('GET', '/backups', undefined, token)).json?.backups ?? []);
    const pre = backups.filter((b) => b.kind === 'PRE_MIGRATION');
    if (sameSchema) {
      check('UP-7 the schema did not move (same database version in both builds)', info.schemaVersion === facts.schemaVersion, `schema ${facts.schemaVersion} -> ${info.schemaVersion}`);
      check('UP-8 no PRE_MIGRATION backup was made, because there was no migration', pre.length === 0, `${pre.length} found`);
    } else {
      check('UP-7 MIGRATION: the database schema moved forward (the migrations the newer build carries ran)', info.schemaVersion > facts.schemaVersion, `schema ${facts.schemaVersion} -> ${info.schemaVersion}`);
      const ofOld = pre.filter((b) => b.schemaVersion === facts.schemaVersion && String(b.createdAt) >= facts.seededAt.slice(0, 19));
      check('UP-8 BACKUP BEFORE THE UPGRADE: a PRE_MIGRATION backup of the OLD schema was made before the migration changed the database', ofOld.length >= 1, `${pre.length} PRE_MIGRATION backup(s); of schema ${facts.schemaVersion}: ${ofOld.length}`);
    }
    const health = (await rest('GET', '/system/health', undefined, token)).json;
    const failing = (health?.checks ?? []).filter((c) => c.status === 'FAIL' || c.status === 'ERROR');
    check('UP-9 the system health shows no failing check after the upgrade', failing.length === 0, failing.map((c) => c.id).join(', '));
    check('UP-10 a normal quit stops the program and its backend', await quitCleanly(page));
    console.log('      NOT PROVEN: both installers carry version "1.0.0" (only the database schema differs), so this does not test a version-number upgrade.');
  }
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
} finally {
  try { if (browser) await browser.close(); } catch { /* gone */ }
  try { if (child && alive(child.pid)) execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch { /* gone */ }
}
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
