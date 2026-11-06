// The long data lists (Students, Teachers, Classes) are PAGED, in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public):
//   1. Students (45 invented pupils): 10 to a page, "1-10 of 45", next / last / first, every pupil on exactly one page and the pages together in the same order as the whole list,
//      20 / 50 / 100 to a page, a new search starts at page 1 and shows no pager when the answer is short, the page size is kept (in memory) after leaving the page
//   2. Teachers (23 invented): 10 + 10 + 3; a teacher added through the form is shown on its own page (the list jumps to it); changing the status filter starts at page 1
//   3. Classes (12 invented): the pager appears above 10 classes; 10 + 2; a class added through the form is shown on its own page; another grade (none) and back starts at page 1
//   4. nothing is stored in the browser, no CSP violation, no console error, only local origins
// A year, the classes, pupils and teachers are seeded through the backend's own REST API; everything that is checked is done through the real UI. All people are invented.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-lists.mjs
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
// Khmer consonants in their alphabet order: a pair of them makes a name that is different for every person, and the last one sorts last
const C = ['ក', 'ខ', 'គ', 'ឃ', 'ង', 'ច', 'ឆ', 'ជ', 'ឈ', 'ញ'];
const nameOf = (i, word) => `${C[Math.floor(i / 10)]}${C[i % 10]} ${word}`;
const N_STUDENTS = 45;
const N_TEACHERS = 23;
const N_CLASSES = 12;
const CLASS_NAMES = ['ក', 'ខ', 'គ', 'ឃ', 'ង', 'ច', 'ឆ', 'ជ', 'ឈ', 'ញ', 'ដ', 'ឋ'];
const LAST_TEACHER = 'អអ គ្រូថ្មី';
const LAST_CLASS = 'អ';
const data = mkdtempSync(path.join(tmpdir(), 'sms ទិន្នន័យ '));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;

let app;
const consoleErrors = [];
const origins = new Set();

try {
  app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop], env, timeout: 120_000 });
  let page;
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('main window did not appear');
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4(01|22|29)\b/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('request', (r) => { if (/^(data|blob):/.test(r.url())) return; const u = new URL(r.url()); origins.add(u.protocol + '//' + u.host); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
  const button = (text) => page.getByRole('button', { name: text, exact: true });
  const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
  const goTo = async (href, waitFor) => { await page.locator(`a[href="${href}"]`).first().click(); await waitFor.waitFor({ timeout: 30_000 }); };
  const mainWindowCall = (fn, arg) => app.evaluate(({ BrowserWindow }, a) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    return new Function('win', 'a', `return (${a.fn})(win, a.arg)`)(win, a);
  }, { fn: fn.toString(), arg });
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
    await page.screenshot({ path: path.join(outDir, `lists-e2e-${name}.png`) });
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = ''; }));
  };

  // ---- a fresh install through the wizard (the first account is the administrator) -----------------------------------------------------------
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

  // ---- seed: a year, 12 classes of grade 1, 45 pupils, 23 teachers ---------------------------------------------------------------------------
  let apiToken = null;
  const rest = (method, apiPath, body) => page.evaluate(async ({ method, apiPath, body, token }) => {
    const info = await window.desktop.getInfo();
    const res = await fetch(`${info.backendBaseUrl}/api/v1${apiPath}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text, json: text ? JSON.parse(text) : null };
  }, { method, apiPath, body, token: apiToken });
  const must = (res, what) => { if (res.status >= 300) throw new Error(`seeding ${what} failed: ${res.status} ${res.body.slice(0, 200)}`); return res.json; };
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
  apiToken = must(await rest('POST', '/auth/login', { username: 'admin.sokha', password: PW }), 'login').token;
  const year = must(await rest('POST', '/academic-years', { nameKm: 'ឆ្នាំសាកល្បង', startDate: dayOffset(-60), endDate: dayOffset(200), makeCurrent: true }), 'year');
  const grades = must(await rest('GET', '/grades'), 'grades').sort((a, b) => a.level - b.level);
  const grade1 = grades[0];
  for (const name of CLASS_NAMES) must(await rest('POST', '/classes', { academicYearId: year.id, gradeId: grade1.id, nameKm: name, capacity: null, homeroomTeacherId: null, shift: null }), `class ${name}`);
  for (let i = 0; i < N_STUDENTS; i++) must(await rest('POST', '/students', { nameKm: nameOf(i, 'សិស្ស'), gender: i % 2 ? 'FEMALE' : 'MALE', dateOfBirth: '2019-01-01', enrollmentDate: null, classId: null, allowDuplicate: false, guardians: [] }), `pupil ${i}`);
  for (let i = 0; i < N_TEACHERS; i++) must(await rest('POST', '/teachers', { nameKm: nameOf(i, 'គ្រូ'), gender: 'FEMALE', phone: '', address: '', specialization: '', employmentDate: null }), `teacher ${i}`);
  await mainWindowCall((win) => { win.unmaximize(); win.setContentSize(1366, 1100); });
  await page.waitForTimeout(500);

  const info = (from, to, total, unit) => t('pager.showing').replace('{from}', from).replace('{to}', to).replace('{total}', total).replace('{unit}', unit);
  const pagerOf = (id) => page.locator(`[data-testid=${id}]`);
  const infoOf = (pager) => pager.locator('[data-testid=pager-info]').innerText();
  const rowCount = () => page.locator('tbody tr').count();
  const firstCells = () => page.locator('tbody tr td:nth-child(2)').evaluateAll((cells) => cells.map((c) => c.querySelector('a')?.textContent?.trim() ?? c.textContent.trim()));
  const waitRows = (n) => page.waitForFunction((count) => document.querySelectorAll('tbody tr').length === count, n, { timeout: 15_000 });
  const waitInfo = (pager, text) => page.waitForFunction(({ id, expected }) => document.querySelector(`[data-testid=${id}] [data-testid=pager-info]`)?.textContent?.trim() === expected, { id: pager, expected: text }, { timeout: 15_000 });
  const setSize = async (pager, value) => { await pager.locator('[data-testid=pager-size]').selectOption(String(value)); };

  // ---- 1. Students ------------------------------------------------------------------------------------------------------------------------------
  await goTo('/students', heading(t('students.title')));
  const sp = pagerOf('students-pager');
  await sp.waitFor({ timeout: 30_000 });
  const SU = t('students.unit');
  check('LP-1a 45 pupils: the list starts with 10 to a page, 10 rows, "1-10 of 45", and the count above the table still says 45', (await rowCount()) === 10 && (await infoOf(sp)) === info(1, 10, 45, SU) && (await page.locator('p.text-muted.small', { hasText: t('students.count').replace('{n}', '45') }).count()) === 1
    && (await sp.locator('[data-page]').count()) === 5);
  await shot('1-students-page1');
  const pagesSeen = [...(await firstCells())];
  for (let p = 2; p <= 5; p++) {
    await sp.locator('[data-testid=pager-next]').click();
    await waitInfo('students-pager', info((p - 1) * 10 + 1, Math.min(p * 10, 45), 45, SU));
    pagesSeen.push(...(await firstCells()));
  }
  check('LP-1b "next" four times reaches page 5 ("41-45", 5 rows), where "next" and "last" are off', (await rowCount()) === 5 && (await sp.locator('[data-testid=pager-next]').isDisabled()) && (await sp.locator('[data-testid=pager-last]').isDisabled()));
  await shot('2-students-last-page');
  await sp.locator('[data-testid=pager-first]').click();
  await waitInfo('students-pager', info(1, 10, 45, SU));
  await setSize(sp, 100);
  await waitRows(45);
  const whole = await firstCells();
  check('LP-1c every pupil is on exactly one page, and the five pages together are the whole list in the same order (45 different names)', pagesSeen.length === 45 && new Set(pagesSeen).size === 45 && pagesSeen.join('|') === whole.join('|'));
  await setSize(sp, 20);
  await waitInfo('students-pager', info(1, 20, 45, SU));
  const buttons20 = await sp.locator('[data-page]').count();
  await setSize(sp, 50);
  await waitInfo('students-pager', info(1, 45, 45, SU));
  check('LP-1d 20 to a page makes 3 numbered pages, 50 to a page puts all 45 on one page ("1-45 of 45") with "next" off', buttons20 === 3 && (await rowCount()) === 45 && (await sp.locator('[data-testid=pager-next]').isDisabled()));
  await setSize(sp, 10);
  await waitInfo('students-pager', info(1, 10, 45, SU));
  await sp.locator('[data-testid=pager-last]').click();
  await waitInfo('students-pager', info(41, 45, 45, SU));
  const wanted = nameOf(23, 'សិស្ស');
  await page.locator('#student-search').fill(wanted);
  await waitRows(1);
  check('LP-1e a new search shows its answer from the start (one pupil, no pager for a list that short) although the list was on page 5', (await rowCount()) === 1 && (await pagerOf('students-pager').count()) === 0 && (await firstCells())[0] === wanted);
  await page.locator('#student-search').fill('');
  await waitInfo('students-pager', info(1, 10, 45, SU));
  check('LP-1f clearing the search starts at page 1 again ("1-10 of 45"), not at the page it was left on', (await rowCount()) === 10);
  await setSize(sp, 50);
  await waitRows(45);
  await goTo('/teachers', heading(t('teachers.title')));
  await goTo('/students', heading(t('students.title')));
  await pagerOf('students-pager').waitFor({ timeout: 15_000 });
  check('LP-1g the page size is kept while the program is open: coming back finds 50 to a page and all 45 shown', (await pagerOf('students-pager').locator('[data-testid=pager-size]').inputValue()) === '50' && (await rowCount()) === 45);

  // ---- 2. Teachers --------------------------------------------------------------------------------------------------------------------------------
  await goTo('/teachers', heading(t('teachers.title')));
  const tp = pagerOf('teachers-pager');
  await tp.waitFor({ timeout: 30_000 });
  const TU = t('teachers.unit');
  check('LP-2a 23 teachers: 10 rows on the first page ("1-10 of 23")', (await rowCount()) === 10 && (await infoOf(tp)) === info(1, 10, 23, TU));
  await tp.locator('[data-testid=pager-last]').click();
  await waitInfo('teachers-pager', info(21, 23, 23, TU));
  check('LP-2b the last page (3) has the other 3 ("21-23")', (await rowCount()) === 3);
  await tp.locator('[data-testid=pager-first]').click();
  await waitInfo('teachers-pager', info(1, 10, 23, TU));
  const modal = page.locator('.modal.show');
  await button(t('teachers.add')).click();
  await modal.locator('input[id^="field-nameKm-"]').fill(LAST_TEACHER);
  await modal.locator('select[id^="field-gender-"]').first().selectOption({ label: t('gender.FEMALE') });
  await modal.getByRole('button', { name: t('common.save'), exact: true }).click();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('tbody tr', { hasText: LAST_TEACHER }).waitFor({ timeout: 15_000 });
  check('LP-2c a teacher added through the form (it sorts last) is on screen: the list went from page 1 to page 3 by itself, "21-24 of 24"', (await infoOf(tp)) === info(21, 24, 24, TU) && (await rowCount()) === 4);
  await shot('3-teachers-new-teacher-page');
  await page.locator('#teacher-status').selectOption('INACTIVE');   // nobody is inactive: the list is empty, and the page number must not be remembered
  await page.getByText(t('teachers.empty')).waitFor({ timeout: 15_000 });
  await page.locator('#teacher-status').selectOption('ACTIVE');
  await waitInfo('teachers-pager', info(1, 10, 24, TU));
  check('LP-2d changing the status filter and back starts at page 1 ("1-10 of 24"), not at page 3', (await rowCount()) === 10);

  // ---- 3. Classes -----------------------------------------------------------------------------------------------------------------------------------
  await goTo('/classes', heading(t('classes.title')));
  const cp = pagerOf('classes-pager');
  await cp.waitFor({ timeout: 30_000 });
  const CU = t('classes.unit');
  check('LP-3a 12 classes: more than 10, so the pager is there with 10 rows on the first page ("1-10 of 12")', (await rowCount()) === 10 && (await infoOf(cp)) === info(1, 10, 12, CU));
  await cp.locator('[data-testid=pager-next]').click();
  await waitInfo('classes-pager', info(11, 12, 12, CU));
  const classRows2 = await rowCount();
  await setSize(cp, 20);
  await waitInfo('classes-pager', info(1, 12, 12, CU));
  check('LP-3b the second page has the other 2 ("11-12"), and 20 to a page shows all 12 on one page', classRows2 === 2 && (await rowCount()) === 12);
  await setSize(cp, 10);
  await waitInfo('classes-pager', info(1, 10, 12, CU));
  await button(t('classes.add')).click();
  await modal.locator('select[id^="field-gradeId-"]').first().selectOption({ label: grade1.nameKm });
  await modal.locator('input[id^="field-nameKm-"]').fill(LAST_CLASS);
  await modal.getByRole('button', { name: t('common.save'), exact: true }).click();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('tbody tr a', { hasText: LAST_CLASS }).first().waitFor({ timeout: 15_000 });
  check('LP-3c a class added through the form (it sorts last) is on screen: the list went to page 2 by itself, "11-13 of 13"', (await infoOf(cp)) === info(11, 13, 13, CU) && (await rowCount()) === 3);
  await shot('4-classes-new-class-page');
  await page.locator('#class-grade').selectOption(String(grades[1].id));
  await page.locator('p.text-muted', { hasText: t('classes.empty') }).waitFor({ timeout: 15_000 });
  await page.locator('#class-grade').selectOption('');
  await waitInfo('classes-pager', info(1, 10, 13, CU));
  check('LP-3d another grade (no classes) and back to all grades starts at page 1 ("1-10 of 13")', (await rowCount()) === 10);

  // ---- 4. nothing stored in the browser, no CSP violation, no console error, local origins only -----------------------------------------------------
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
  check('LP-4a the program stores nothing in the browser (localStorage, sessionStorage, cookies are empty)', stored.local === 0 && stored.session === 0 && stored.cookies === '', JSON.stringify(stored));
  const csp = await page.evaluate(() => window.__csp);
  check('LP-4b no CSP violation, no console error, and only app://school and the local backend were contacted', csp.length === 0 && consoleErrors.length === 0 && [...origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)),
    [...csp, ...consoleErrors, ...[...origins].filter((o) => o !== 'app://school' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(o))].slice(0, 3).join(' | '));

  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('LP-5 quitting stops the app and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { const p = app?.windows().find((w) => w.url().startsWith('app://school')); if (p) await p.screenshot({ path: path.join(outDir, 'lists-e2e-FAIL.png') }); } catch { /* ignore */ }
} finally {
  // only what THIS run started is stopped (the program's own window, if the owner has one open, is never touched)
  let leftoverJava = 0;
  try { leftoverJava = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8')); } catch { /* a clean quit removed it */ }
  try { if (app) await app.close(); } catch { /* already gone */ }
  try { if (leftoverJava > 0) execFileSync('taskkill', ['/PID', String(leftoverJava), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  await sleep(500);
  try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
