// The premium dashboard in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public), three launches on SCRATCH data only:
//   A. a fresh, empty school (the first screen after the wizard): the hero, the figures, and a meaningful empty state in every chart; the figures appear BEFORE the charts (the charts'
//      answer is delayed on purpose); no console error
//   B. a copy of the FICTIONAL sample school (scripts/seed-sample-data.mjs --dir): the hero and the four figure tiles with their old test hooks, the charts drawn from the school's own
//      data and equal to the API's answer, "show as table", keyboard and tap/click choice, the unofficial-grading notice on the examination chart, a gap / an unrecorded gender / a class
//      with no capacity / two currencies drawn as they should be (the answer is altered on its way to the page), animation on by default and OFF for "reduce motion", no horizontal page
//      scrolling at Full HD and 1366x768 at 100 / 125 / 150 %, nothing about the timetable or homework, nothing stored in the browser
//   C. the Low-memory preset: the same charts, no animation
// Nothing of the owner's data is touched: every folder is made for this run and deleted at its end.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.   Usage: node desktop/test/e2e-dashboard.mjs
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const temp = [];
const scratch = (prefix) => { const d = mkdtempSync(path.join(tmpdir(), prefix)); temp.push(d); return d; };
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };

/** Starts the program on a data folder and returns what a phase needs; `quit` stops exactly what this call started. */
async function start(dataDir) {
  const env = { ...process.env, SMS_DATA_DIR: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop], env, timeout: 120_000 });
  let page;
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('main window did not appear');
  const consoleErrors = [];
  const origins = new Set();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (4(01|09|22|29)|500)\b/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('request', (r) => { if (/^(data|blob):/.test(r.url())) return; const u = new URL(r.url()); origins.add(u.protocol + '//' + u.host); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  const mainWindowCall = (fn, arg) => app.evaluate(({ BrowserWindow }, a) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    return new Function('win', 'a', `return (${a.fn})(win, a.arg)`)(win, a);
  }, { fn: fn.toString(), arg });
  const quit = async () => {
    let javaPid = 0;
    try { javaPid = Number(readFileSync(path.join(dataDir, 'config', 'backend.pid'), 'utf8')); } catch { /* none */ }
    const electronPid = app.process().pid;
    page.evaluate(() => window.desktop.quit()).catch(() => {});
    let down = false;
    for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && (!javaPid || !alive(javaPid)); }
    if (!down) { try { await app.close(); } catch { /* gone */ } try { if (javaPid > 0) execFileSync('taskkill', ['/PID', String(javaPid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ } }
    return down;
  };
  return { app, page, consoleErrors, origins, mainWindowCall, quit };
}

const tid = (page, id) => page.locator(`[data-testid="${id}"]`);
const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
  await page.screenshot({ path: path.join(outDir, `dashboard-e2e-${name}.png`) });
  await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = ''; }));
};
const rest = (page, token) => (method, apiPath, body) => page.evaluate(async ({ method, apiPath, body, token }) => {
  const info = await window.desktop.getInfo();
  const res = await fetch(`${info.backendBaseUrl}/api/v1${apiPath}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}, { method, apiPath, body, token });
const goTo = async (page, href, waitFor) => { await page.locator(`a[href="${href}"]`).first().click(); await waitFor.waitFor({ timeout: 30_000 }); };
const openDashboard = async (page) => { await goTo(page, '/students', page.locator('h1, h2').first()); await goTo(page, '/dashboard', tid(page, 'dashboard-hero')); };

try {
  // ============================================================================================================================================================
  // A. a fresh, empty school
  // ============================================================================================================================================================
  const dataA = scratch('sms ទិន្នន័យ-A ');
  const A = await start(dataA);
  {
    const { page } = A;
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
    // the charts' answer is slow on purpose, from the moment the dashboard first opens: the figures must not wait for it
    await page.route('**/api/v1/dashboard/charts', async (route) => { await sleep(3000); await route.continue(); });
    for (let i = 0; i < 4 && !(await button(t('setup.finish.start')).count()); i++) { await skipOrNext(); await page.waitForTimeout(700); }
    await button(t('setup.finish.start')).click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await tid(page, 'dashboard-figures').waitFor({ timeout: 30_000 });
    const loadingNow = await page.locator('[data-testid=chart-loading]').count();
    check('DB-A1 the figures are on the screen while the charts are still loading (their answer is held back 3 s): five quiet placeholders, no spinner, no error',
      (await tid(page, 'stat-students').isVisible()) && loadingNow >= 5 && (await page.locator('.alert-danger, [data-testid=chart-failed]').count()) === 0, `${loadingNow} placeholders`);
    await page.locator('[data-testid=chart-empty]').first().waitFor({ timeout: 30_000 });
    await page.unroute('**/api/v1/dashboard/charts');
    const empties = await page.locator('[data-testid=chart-empty]').allInnerTexts();
    const attendanceCards = await tid(page, 'chart-attendance').count();
    check('DB-A2 a school with no year and no student says so in every chart instead of drawing nothing: five cards, each with a sentence of its own (no year / no students), and no fees card while fees are off',
      empties.length === 5 && empties.filter((x) => x.includes(t('dashboard.charts.noYear'))).length === 4 && empties.some((x) => x.includes(t('dashboard.charts.gender.empty'))) && (await tid(page, 'chart-fees').count()) === 0 && attendanceCards === 1, empties.join(' | ').slice(0, 200));
    check('DB-A3 the hero greets the administrator and the school, has no year chip yet, and offers three quick links that go to the right pages',
      (await page.locator('h1').first().innerText()).includes('សុខា') && (await tid(page, 'hero-year').count()) === 0 && (await tid(page, 'hero-date').innerText()).length > 4
      && (await Promise.all(['/attendance', '/students/new', '/exams'].map((h) => tid(page, 'hero-actions').locator(`a[href="${h}"]`).count()))).every((n) => n === 1));
    await shot(page, 'A-empty');
    check('DB-A4 a fresh school\'s dashboard has no console error and no CSP violation', A.consoleErrors.length === 0 && (await page.evaluate(() => window.__csp)).length === 0, A.consoleErrors.slice(0, 2).join(' | '));
  }
  check('DB-A5 quitting stops the program and its backend', await A.quit());

  // ============================================================================================================================================================
  // B. a copy of the fictional sample school
  // ============================================================================================================================================================
  const dataB = path.join(tmpdir(), `sms-dash-sample-${Date.now()}`);   // seed-sample-data wants a folder that does not exist yet
  temp.push(dataB);
  execFileSync(process.execPath, [path.join(root, 'scripts', 'seed-sample-data.mjs'), '--dir', dataB], { stdio: 'ignore', timeout: 600_000 });
  const login = readFileSync(path.join(dataB, 'SAMPLE-LOGIN.txt'), 'utf8');
  const USER = /Username:\s*(\S+)/.exec(login)?.[1];
  const PASS = /Password:\s*(\S+)/.exec(login)?.[1];
  const B = await start(dataB);
  const { page } = B;
  await page.locator('input[id^="field-username-"]').waitFor({ timeout: 60_000 });
  await page.locator('input[id^="field-username-"]').fill(USER);
  await page.locator('input[id^="field-password-"]').fill(PASS);
  await page.getByRole('button', { name: t('auth.login.submit'), exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 60_000 });
  await tid(page, 'dashboard-figures').waitFor({ timeout: 30_000 });
  const token = await page.evaluate(async ({ user, pass }) => {
    const info = await window.desktop.getInfo();
    const res = await fetch(`${info.backendBaseUrl}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
    return (await res.json()).token;
  }, { user: USER, pass: PASS });
  const api = rest(page, token);
  const feesOn = await api('PUT', '/settings/app', { 'fees.enabled': 'true', 'fees.currencies': 'KHR,USD' });
  if (feesOn.status >= 300) throw new Error('could not switch fees on in the scratch copy: ' + feesOn.status);
  await openDashboard(page);
  await page.locator('[data-testid=chart-attendance] [data-testid=trend]').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid=chart-fees] [data-testid=fee-block], [data-testid=chart-fees] [data-testid=chart-empty]').first().waitFor({ timeout: 30_000 });
  const dash = (await api('GET', '/dashboard')).json;
  const charts = (await api('GET', '/dashboard/charts')).json;

  check('DB-B1 the hero: the current year as a gold chip, today\'s date, the greeting and the school name',
    (await tid(page, 'hero-year').innerText()).includes(charts.year.nameKm) && (await tid(page, 'hero-date').innerText()).includes(String(new Date().getFullYear())) && (await page.locator('h1').first().innerText()).includes('គំរូ')
    && (await tid(page, 'dashboard-hero').innerText()).includes('សាលាបឋមសិក្សាគំរូ'));
  await shot(page, 'B-full');
  check('DB-B2 the four figure tiles keep their old test hooks and their figures (students, teachers, classes, attendance today with its split and its counting method), and the cards below are still there',
    (await tid(page, 'stat-students').innerText()) === String(dash.students.active) && (await tid(page, 'stat-teachers').innerText()) === String(dash.activeTeachers) && (await tid(page, 'stat-classes').innerText()) === String(dash.classes)
    && (await tid(page, 'stat-attendance').innerText()) === `${dash.attendanceToday.classesRecorded} / ${dash.attendanceToday.classes}` && (await tid(page, 'stat-attendance-split').count()) === 1 && (await tid(page, 'stat-attendance-basis').count()) === 1
    && (await tid(page, 'stat-attendance').locator('xpath=..').innerText()).includes((await tid(page, 'stat-attendance-split').innerText()).trim())   // the value's parent still holds the split (e2e-app reads it that way)
    && (await tid(page, 'recent-exams').count()) === 1 && (await tid(page, 'fees-outstanding').count()) === 1);

  // ---- the charts equal the API's answer
  const gradeTotals = charts.studentsByGrade.grades.map((g) => g.male + g.female + g.unknown);
  const gradeValues = await page.locator('[data-testid=chart-grades] [data-testid=bar-row] .bar-value').allInnerTexts();
  check('DB-B3 students by grade: one row per grade (six), each with the total the API gives, the boys and girls segments, and a summary sentence',
    gradeValues.length === 6 && gradeValues.join(',') === gradeTotals.join(',') && (await page.locator('[data-testid=chart-grades] [data-testid=bar-row]').first().locator('rect.bar-seg').count()) >= 2 && (await page.locator('[data-testid=chart-grades] [data-testid=chart-summary]').innerText()).length > 20, gradeValues.join(','));
  const donutTotal = await page.locator('[data-testid=chart-gender] [data-testid=donut-total]').innerText();
  const donutKeys = await page.locator('[data-testid=chart-gender] [data-testid=donut-key] .donut-key-value').allInnerTexts();
  check('DB-B4 gender: the donut\'s total is the number of active students, and boys + girls (+ unrecorded, only if any) add up to it',
    donutTotal === String(charts.gender.total) && donutTotal === String(dash.students.active) && donutKeys.map(Number).reduce((a, b) => a + b, 0) === charts.gender.total && donutKeys[0] === String(charts.gender.male) && donutKeys[1] === String(charts.gender.female), donutKeys.join(','));
  const fillValues = await page.locator('[data-testid=chart-fill] [data-testid=bar-row] .bar-value').allInnerTexts();
  check('DB-B5 class fill: one row per class with its head count and the capacity stored for it, and the sentence that explains the mark',
    fillValues.length === charts.classFill.length && fillValues.join('|') === charts.classFill.map((c) => (c.capacity === null ? String(c.students) : `${c.students} / ${c.capacity}`)).join('|') && (await page.locator('[data-testid=chart-fill] .chart-note').count()) === 1, fillValues.join('|'));
  const examRowsUi = await page.locator('[data-testid=chart-exam] [data-testid=bar-row] .bar-value').allInnerTexts();
  check('DB-B6 the latest examination: one bar per class with the average of its complete students, the pass / fail / not-complete donut, and the unofficial-grading notice (the grading rules are not signed off)',
    !!charts.latestExam && examRowsUi.length === charts.latestExam.classes.length && examRowsUi.join('|') === charts.latestExam.classes.map((c) => (c.averagePercent === null ? '—' : `${Math.round(c.averagePercent * 10) / 10}%`)).join('|')
    && (await page.locator('[data-testid=chart-exam] [data-testid=donut-key]').count()) === 3 && (await page.locator('[data-testid=chart-exam] [data-testid=draft-grading-rules]').count()) === 1 && (await page.locator('[data-testid=chart-exam] [data-testid=draft-grading-rules]').innerText()).includes(t('dashboard.charts.exam.unofficial')), examRowsUi.join('|'));
  check('DB-B7 attendance: a line over the recorded days with a day-by-day sentence, the little trend on the attendance tile, and the counting method named in the summary',
    (await page.locator('[data-testid=chart-attendance] [data-testid=trend-hit]').count()) === charts.attendance.days.length && (await page.locator('[data-testid=stat-attendance]').locator('xpath=ancestor::a').locator('[data-testid=sparkline]').count()) === 1
    && (await page.locator('[data-testid=chart-attendance] [data-testid=chart-summary]').innerText()).includes(t(`attendance.basis.${charts.attendance.basis}`)));
  const feeBlocksUi = await page.locator('[data-testid=chart-fees] [data-testid=fee-block]').count();
  check('DB-B8 fees (switched on in this scratch copy): the chart is there, with one block per allowed currency and never a combined one, or its own sentence when nothing was collected in the six months',
    (feeBlocksUi === 2 && (await page.locator('[data-testid=chart-fees] [data-testid=fee-block]').evaluateAll((b) => b.map((x) => x.getAttribute('data-currency')))).join() === 'KHR,USD') || ((await page.locator('[data-testid=chart-fees] [data-testid=chart-empty]').count()) === 1 && charts.fees.series.every((s) => s.months.every((m) => m.collected === 0))), `${feeBlocksUi} blocks`);

  const splitPieces = await page.locator('[data-testid=stat-attendance-split] .no-break').evaluateAll((els) => els.map((e) => e.getClientRects().length));
  check('DB-B8b each piece of today\'s attendance split (present, late, partial, absent, leave) stays on one line: a Khmer word such as អវត្តមាន is never broken in two', splitPieces.length >= 4 && splitPieces.every((n) => n === 1), splitPieces.join(','));
  for (const id of ['chart-grades', 'chart-fill', 'chart-exam', 'chart-fees']) {
    await tid(page, id).scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await tid(page, id).screenshot({ path: path.join(outDir, `dashboard-e2e-card-${id}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  // ---- show as table, keyboard, tap
  await page.locator('[data-testid=chart-grades] [data-testid=chart-table-toggle]').click();
  const tableRows = await page.locator('[data-testid=chart-grades] [data-testid=chart-table] tbody tr').count();
  const firstCells = await page.locator('[data-testid=chart-grades] [data-testid=chart-table] tbody tr').first().locator('th, td').allInnerTexts();
  check('DB-B9 "show as table" shows the same data as a table (a caption, a header row, one row per grade, the exact figures) in place of the chart, and "show as chart" brings it back',
    tableRows === 6 && firstCells.join(',') === [charts.studentsByGrade.grades[0].nameKm, charts.studentsByGrade.grades[0].male, charts.studentsByGrade.grades[0].female, charts.studentsByGrade.grades[0].unknown, gradeTotals[0]].join(',')
    && (await page.locator('[data-testid=chart-grades] [data-testid=bar-rows]').count()) === 0 && (await page.locator('[data-testid=chart-grades] [data-testid=chart-table-toggle]').getAttribute('aria-pressed')) === 'true');
  await page.locator('[data-testid=chart-grades] [data-testid=chart-table-toggle]').click();
  check('DB-B9b back to the chart', (await page.locator('[data-testid=chart-grades] [data-testid=bar-rows]').count()) === 1 && (await page.locator('[data-testid=chart-grades] [data-testid=chart-table]').count()) === 0);
  const rows = page.locator('[data-testid=chart-grades] [data-testid=bar-row]');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const tabStops = await page.locator('[data-testid=chart-grades] [data-testid=bar-row][tabindex="0"]').count();
  const details3 = await page.locator('[data-testid=chart-grades] [data-testid=chart-details]').innerText();
  const label3 = await rows.nth(2).getAttribute('aria-label');
  await page.keyboard.press('End');
  const detailsEnd = await page.locator('[data-testid=chart-grades] [data-testid=chart-details]').innerText();
  check('DB-B10 keyboard: one tab stop for the whole chart; the arrow keys move from row to row and the sentence of the chosen row is shown (and read out); End goes to the last row',
    tabStops === 1 && details3 === label3 && detailsEnd === (await rows.nth(5).getAttribute('aria-label')) && (await rows.nth(5).evaluate((e) => document.activeElement === e)), details3);
  await page.locator('[data-testid=chart-gender] [data-testid=donut-key]').nth(1).click();
  const donutDetails = await page.locator('[data-testid=chart-gender] [data-testid=chart-details]').innerText();
  const trendFrame = page.locator('[data-testid=chart-attendance] [data-testid=trend-frame]');
  await trendFrame.focus();
  await page.keyboard.press('Home');
  const trendFirst = await page.locator('[data-testid=chart-attendance] [data-testid=chart-details]').innerText();
  await page.keyboard.press('ArrowRight');
  const trendSecond = await page.locator('[data-testid=chart-attendance] [data-testid=chart-details]').innerText();
  check('DB-B11 a tap (a click) on a legend entry chooses it and shows its sentence with its share; the attendance line is one tab stop too: Home goes to the first day, the arrow to the next, each with its own sentence',
    donutDetails.includes(`${charts.gender.female}`) && donutDetails.includes('%') && trendFirst !== trendSecond && trendFirst.includes(`/${charts.attendance.days[0].date.slice(5, 7).replace(/^0/, '')}`), `${donutDetails} | ${trendFirst}`);

  // ---- the edge cases the sample school does not have, drawn as they should be: the answer is altered on its way to the page
  let mode = 'real';
  // (the launch secret is added to the page's requests inside the shell, so route.fetch() would be refused: the altered answers are made from a copy of the real one, `charts`)
  await page.route('**/api/v1/dashboard/charts', async (route) => {
    if (mode === 'real') { await route.continue(); return; }
    const request = route.request();
    const cors = { 'access-control-allow-origin': request.headers().origin ?? '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS', vary: 'Origin' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    const body = structuredClone(charts);
    if (mode === 'edges') {
      body.attendance.days = [
        { date: '2026-11-02', recorded: true, classesRecorded: 7, present: 60, late: 4, partial: 2, absent: 5, leave: 1, total: 72, presentPercent: 83.3 },
        { date: '2026-11-03', recorded: false, classesRecorded: 0, present: null, late: null, partial: null, absent: null, leave: null, total: null, presentPercent: null },
        { date: '2026-11-04', recorded: true, classesRecorded: 5, present: 50, late: 0, partial: 0, absent: 10, leave: 0, total: 60, presentPercent: 83.3 },
        { date: '2026-11-05', recorded: false, classesRecorded: 0, present: null, late: null, partial: null, absent: null, leave: null, total: null, presentPercent: null },
        { date: '2026-11-06', recorded: true, classesRecorded: 7, present: 66, late: 3, partial: 0, absent: 3, leave: 0, total: 72, presentPercent: 91.7 },
      ];
      body.gender = { male: 30, female: 39, unknown: 3, total: 72 };
      body.classFill[0].capacity = null;
      body.fees = { months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'], series: [
        { currency: 'KHR', months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m, i) => ({ month: m, collected: i * 10000 })) },
        { currency: 'USD', months: ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map((m, i) => ({ month: m, collected: i === 5 ? 25.5 : 0 })) },
      ] };
    } else if (mode === 'none') {
      Object.assign(body, { year: null, studentsByGrade: { grades: [], notInAClass: 0 }, attendance: { basis: 'DAY', classes: 0, days: [] }, classFill: [], latestExam: null });
    } else if (mode === 'failed') {
      await route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL_ERROR' }) });
      return;
    }
    await route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  });
  const reopen = async (waitFor) => { await openDashboard(page); await page.locator(waitFor).first().waitFor({ timeout: 30_000 }); };
  mode = 'edges';
  await reopen('[data-testid=chart-attendance] [data-testid=trend]');
  const gaps = await page.locator('[data-testid=chart-attendance] [data-testid=trend-gap]').count();
  const linePaths = await page.locator('[data-testid=chart-attendance] path.trend-line').count();
  await trendFrame.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const gapDetails = await page.locator('[data-testid=chart-attendance] [data-testid=chart-details]').innerText();
  const gapCircles = await page.locator('[data-testid=chart-attendance] [data-testid=trend-gap] circle').count();
  const gapBands = await page.locator('[data-testid=chart-attendance] [data-testid=trend-gap] rect').count();
  check('DB-B12 a day nobody recorded is a GAP: two hatched bands with a dashed line and NO mark on the 0% line, the line is broken into separate pieces (never dragged down to zero), and the day\'s own sentence says there is no record',
    gaps === 2 && gapBands === 2 && gapCircles === 0 && linePaths === 0 && gapDetails.includes(t('dashboard.charts.attendance.gap')) && !/\b0%/.test(gapDetails), `${gaps} gaps, ${gapBands} bands, ${gapCircles} marks, ${linePaths} line pieces, "${gapDetails}"`);
  const donut3 = await page.locator('[data-testid=chart-gender] [data-testid=donut-key]').allInnerTexts();
  check('DB-B13 students whose gender is not recorded stay in the totals: a third legend entry, a total of 72 = 30 + 39 + 3',
    donut3.length === 3 && donut3[2].includes(t('dashboard.charts.unknown')) && donut3[2].includes('3') && (await page.locator('[data-testid=chart-gender] [data-testid=donut-total]').innerText()) === '72');
  const firstFill = await page.locator('[data-testid=chart-fill] [data-testid=bar-row]').first().evaluate((b) => ({ value: b.querySelector('.bar-value').textContent, label: b.getAttribute('aria-label'), markers: b.querySelectorAll('.bar-marker').length }));
  check('DB-B14 a class with no capacity stored shows its head count alone, no mark and no made-up capacity, and says so', !firstFill.value.includes('/') && firstFill.markers === 0 && firstFill.label.includes(t('dashboard.charts.fill.noCapacity').replace('{n}', '').trim()), JSON.stringify(firstFill));
  const feeUi = await page.locator('[data-testid=chart-fees] [data-testid=fee-block]').evaluateAll((blocks) => blocks.map((b) => ({ cur: b.getAttribute('data-currency'), head: b.querySelector('.fee-head').textContent, rows: b.querySelectorAll('[data-testid=bar-row]').length })));
  check('DB-B15 two currencies are two separate blocks, each with its own total and its own scale: riel 150,000 and dollars 25.5, nothing added together, nothing converted',
    feeUi.length === 2 && feeUi[0].cur === 'KHR' && feeUi[1].cur === 'USD' && feeUi.every((b) => b.rows === 6) && feeUi[0].head.includes('150,000') && feeUi[1].head.includes('25') && !feeUi[0].head.includes('175') && !feeUi[1].head.includes('150'), JSON.stringify(feeUi.map((b) => b.head)));
  await shot(page, 'B-edges');
  mode = 'none';
  await reopen('[data-testid=chart-empty]');
  const emptyNow = await page.locator('[data-testid=chart-empty]').allInnerTexts();
  check('DB-B16 with no current year the charts say so (four sentences) and the people\'s totals stay (the gender chart still draws)', emptyNow.filter((x) => x.includes(t('dashboard.charts.noYear'))).length === 4 && (await page.locator('[data-testid=chart-gender] [data-testid=donut]').count()) === 1, `${emptyNow.length}`);
  mode = 'failed';
  await reopen('[data-testid=chart-failed]');
  check('DB-B17 when the charts cannot be loaded each card says so with a "try again" button, and the four figure tiles and the cards below are untouched',
    (await page.locator('[data-testid=chart-failed]').count()) >= 5 && (await tid(page, 'stat-students').isVisible()) && (await tid(page, 'recent-exams').isVisible()));
  mode = 'real';
  await page.locator('[data-testid=chart-failed] button').first().click();
  await page.locator('[data-testid=chart-attendance] [data-testid=trend]').waitFor({ timeout: 30_000 });
  check('DB-B18 "try again" loads the charts', (await page.locator('[data-testid=chart-failed]').count()) === 0 && (await page.locator('[data-testid=chart-grades] [data-testid=bar-row]').count()) === 6);

  // ---- motion
  const animationName = () => page.locator('[data-testid=chart-grades] rect.bar-seg').first().evaluate((e) => getComputedStyle(e).animationName);
  const animatedClass = () => page.locator('[data-testid=chart-grades] [data-testid=bar-rows]').evaluate((e) => e.classList.contains('chart-animate'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await reopen('[data-testid=chart-grades] [data-testid=bar-row]');
  check('DB-B19 on the Standard preset, with nothing asked for, the bars grow in (an animation is on)', (await animatedClass()) && (await animationName()) === 'bar-grow', await animationName());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reopen('[data-testid=chart-grades] [data-testid=bar-row]');
  check('DB-B20 for a person who asked their system for less motion there is NO animation (the class is off and the style says none), the charts are drawn all the same', !(await animatedClass()) && (await animationName()) === 'none' && (await page.locator('[data-testid=chart-grades] rect.bar-seg').count()) > 0, await animationName());
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // ---- layout: Full HD and 1366x768 at 100 / 125 / 150 %, no horizontal page scrolling, nothing sticking out of its card
  const workspace = (screenW, screenH, scale) => ({ w: Math.round(screenW / scale), h: Math.round(screenH / scale - 48 - 31) });
  const SCENARIOS = [['fhd-100', workspace(1920, 1080, 1)], ['fhd-125', workspace(1920, 1080, 1.25)], ['fhd-150', workspace(1920, 1080, 1.5)], ['hd-100', workspace(1366, 768, 1)], ['hd-125', workspace(1366, 768, 1.25)], ['hd-150', workspace(1366, 768, 1.5)]];
  const resize = async (w, h) => { await B.mainWindowCall((win, a) => { win.setMinimumSize(0, 0); win.unmaximize(); win.setContentSize(a.w, a.h); }, { w, h }); await sleep(700); };
  for (const [id, size] of SCENARIOS) {
    await resize(size.w, size.h);
    await reopen('[data-testid=chart-grades] [data-testid=bar-row]');
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const cards = [...document.querySelectorAll('.chart-card')];
      const outside = cards.filter((c) => c.scrollWidth > c.clientWidth + 1).length;   // something inside a card is wider than the card (a table has its own scrolling frame)
      return { vw, scrollWidth: document.documentElement.scrollWidth, cards: cards.length, outside };
    });
    check(`DB-B21-${id} (${size.w}x${size.h}) the dashboard does not scroll the page sideways and no chart sticks out of its card`, m.scrollWidth <= m.vw + 1 && m.outside === 0 && m.cards >= 5, JSON.stringify(m));
    if (id === 'hd-150' || id === 'fhd-100') await shot(page, `B-${id}`);
  }
  await resize(1366, 900);

  // ---- independence and storage
  await reopen('[data-testid=chart-grades] [data-testid=bar-row]');
  const dashText = await tid(page, 'dashboard-charts').innerText();
  check('DB-B22 the charts say nothing about the timetable or homework (those modules stay independent of the dashboard)', !dashText.includes(t('nav.timetable')) && !dashText.includes(t('nav.homework')) && !(await tid(page, 'dashboard-hero').innerText()).includes(t('nav.timetable')));
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
  const csp = await page.evaluate(() => window.__csp);
  check('DB-B23 the program stores nothing in the browser, there is no CSP violation and no console error, and only app://school and the local backend were contacted',
    stored.local === 0 && stored.session === 0 && stored.cookies === '' && csp.length === 0 && B.consoleErrors.length === 0 && [...B.origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)), [...csp, ...B.consoleErrors].slice(0, 2).join(' | '));
  check('DB-B24 quitting stops the program and its backend', await B.quit());

  // ============================================================================================================================================================
  // C. the Low-memory preset: the same charts, no animation
  // ============================================================================================================================================================
  const appJson = path.join(dataB, 'config', 'app.json');
  const config = existsSync(appJson) ? JSON.parse(readFileSync(appJson, 'utf8')) : {};
  config.performance = { ...(config.performance ?? {}), preset: 'low-memory' };
  writeFileSync(appJson, JSON.stringify(config));
  const C = await start(dataB);
  {
    const p = C.page;
    await p.locator('input[id^="field-username-"]').waitFor({ timeout: 60_000 });
    await p.locator('input[id^="field-username-"]').fill(USER);
    await p.locator('input[id^="field-password-"]').fill(PASS);
    await p.getByRole('button', { name: t('auth.login.submit'), exact: true }).click();
    await p.waitForURL('**/dashboard', { timeout: 60_000 });
    await p.locator('[data-testid=chart-grades] [data-testid=bar-row]').first().waitFor({ timeout: 60_000 });
    const preset = await p.evaluate(() => window.desktop.config.get());
    const cls = await p.locator('[data-testid=chart-grades] [data-testid=bar-rows]').evaluate((e) => e.classList.contains('chart-animate'));
    const anim = await p.locator('[data-testid=chart-grades] rect.bar-seg').first().evaluate((e) => getComputedStyle(e).animationName);
    check('DB-C1 on the Low-memory preset the charts are drawn all the same but NOTHING animates', preset.preset === 'low-memory' && !cls && anim === 'none' && (await p.locator('[data-testid=chart-attendance] [data-testid=trend]').count()) === 1, JSON.stringify({ preset: preset.preset, cls, anim }));
    check('DB-C2 no console error on the Low-memory preset', C.consoleErrors.length === 0, C.consoleErrors.slice(0, 2).join(' | '));
  }
  check('DB-C3 quitting stops the program and its backend', await C.quit());
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
} finally {
  await sleep(500);
  for (const d of temp) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
