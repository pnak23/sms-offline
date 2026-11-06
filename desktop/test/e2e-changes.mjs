// The change round after Phase 5, in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public):
//   1. the layout fills the window at every size, including maximized (it used to stop at 1100 px and float in the middle)
//   2. who the program is (name, short name, version, channel, developer, copyright) on the sign-in screen, the sidebar, the About page,
//      the window title and both logs, all read from the ONE release file
//   3. the readiness list in its five states, the administrator's sign-off and its withdrawal, and the "not official yet" notices
//   4. attendance sessions: the settings page (add, validate, confirm, edit, switch off, delete rules, the last one) and the attendance screen
//      (session buttons, ticks, copy from another session, remembered choice, a sheet keeping its saved name, history)
//   5. the report card template: every block on and off, signature boxes, the closing note, subject order, the reset, and a card of 12 REAL
//      subjects with everything on measured against one A4 page (the card sets itself in a tighter type when it would not fit)
// A year, a class, students, an examination, scores and a photo are seeded through the backend's own REST API (a second login for the test);
// everything that is checked is done through the real UI.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-changes.mjs
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { latestSchemaVersion } from '../../scripts/lib/schema.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktop = path.join(root, 'desktop');
const outDir = path.join(desktop, 'test', 'out');
mkdirSync(outDir, { recursive: true });
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const release = JSON.parse(readFileSync(path.join(root, 'release', 'release.json'), 'utf8'));
const acceptance = JSON.parse(readFileSync(path.join(root, 'release', 'acceptance.json'), 'utf8')).items;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const data = mkdtempSync(path.join(tmpdir(), 'sms ទិន្នន័យ '));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
const D = (...p) => path.join(data, ...p);

let app;
const consoleErrors = [];
const conflicts = [];
const origins = new Set();

try {
  app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop], env, timeout: 120_000 });
  let page;
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('main window did not appear');
  // a 409 is an answer the server gives on purpose; this run asks for exactly one (the last session cannot be switched off) and counts it, so any other one fails
  page.on('console', (m) => { if (m.type() !== 'error') return; if (/status of 409\b/.test(m.text())) conflicts.push(m.text()); else if (!/status of 4(01|22|29)\b/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('request', (r) => { if (/^(data|blob):/.test(r.url())) return; const u = new URL(r.url()); origins.add(u.protocol + '//' + u.host); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
  const button = (text) => page.getByRole('button', { name: text, exact: true });
  const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
  const goTo = async (href, waitFor) => { await page.locator(`a[href="${href}"]`).first().click(); await waitFor.waitFor({ timeout: 30_000 }); };
  const modalEl = () => page.locator('.modal.show');
  const shot = async (name) => {
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
    await page.screenshot({ path: path.join(outDir, `changes-${name}.png`) });
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = ''; }));
  };
  const mainWindowCall = (fn, arg) => app.evaluate(({ BrowserWindow }, a) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    return new Function('win', 'a', `return (${a.fn})(win, a.arg)`)(win, a);
  }, { fn: fn.toString(), arg });
  const resizeTo = async (w, h) => { await mainWindowCall((win, a) => { win.unmaximize(); win.setContentSize(a[0], a[1]); }, [w, h]); await sleep(400); };
  const maximize = async () => { await mainWindowCall((win) => win.maximize()); await sleep(600); };
  /** How the page container sits in the content area: where it starts, how wide it is, and whether anything overflows sideways. */
  const measure = () => page.evaluate(() => {
    const c = document.querySelector('.page-container').getBoundingClientRect();
    const area = document.querySelector('.app-content');
    const a = area.getBoundingClientRect();
    const cs = getComputedStyle(area);
    const usable = a.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (area.offsetWidth - area.clientWidth);
    return { offset: Math.round(c.left - a.left - parseFloat(cs.paddingLeft)), width: Math.round(c.width), usable: Math.round(usable), overflow: area.scrollWidth - area.clientWidth, window: window.innerWidth };
  });

  // ---- 0. a fresh install: the first screen already says who the program is ----------------------------------------------------------------
  await heading(t('setup.welcome.checksTitle')).waitFor({ timeout: 60_000 });
  const first = await page.locator('[data-testid=auth-product]').innerText();
  check('CH-1a the very first screen (before any account) shows the full system name, the short name and the version, from the release file',
    first.includes(release.name) && first.includes(release.shortName) && first.includes(release.version), first.replace(/\s+/g, ' '));
  check('CH-1b the window title carries the short name (built from the release file)', (await mainWindowCall((win) => win.getTitle())).startsWith(release.shortName), await mainWindowCall((win) => win.getTitle()));
  await shot('01-first-screen');

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

  // ---- 1. the layout fills the window ------------------------------------------------------------------------------------------------------
  for (const [w, h] of [[1200, 650], [1366, 768], [1920, 1080]]) {
    await resizeTo(w, h);
    const m = await measure();
    check(`CH-2 dashboard at ${w}x${h}: the content starts at the left edge of the area and fills it (width ${m.width} of ${m.usable}), nothing overflows sideways`,
      m.offset === 0 && m.width >= m.usable - 2 && m.overflow <= 1, JSON.stringify(m));
    if (w === 1920) await shot('02-dashboard-1920');
  }
  await maximize();
  const maxed = await measure();
  check(`CH-2 dashboard MAXIMIZED (window ${maxed.window} px wide): it fills the area, it no longer floats in the middle (offset ${maxed.offset}, width ${maxed.width} of ${maxed.usable})`,
    maxed.offset === 0 && maxed.width >= maxed.usable - 2 && maxed.overflow <= 1 && maxed.width > 1100, JSON.stringify(maxed));
  await shot('03-dashboard-maximized');
  await goTo('/settings/school', heading(t('settings.school.title')));
  const form = await measure();
  check(`CH-3 a form page keeps a readable width (${form.width} px, at most 960) but starts at the left under its title instead of floating`, form.width <= 960 && form.offset === 0, JSON.stringify(form));
  await shot('04-form-maximized');
  await goTo('/students', heading(t('students.title')));
  const list = await measure();
  check('CH-4 a list page fills the window too', list.width >= list.usable - 2 && list.offset === 0, JSON.stringify(list));
  await resizeTo(1366, 768);

  // ---- 2. who the program is, everywhere it should show -------------------------------------------------------------------------------------
  const side = await page.locator('[data-testid=sidebar-version]').innerText();
  check('CH-5a the sidebar shows the short name and the version', side.trim() === `${release.shortName} v${release.version}`, side);
  await page.locator('.sidebar-toggle').click();
  check('CH-5b with the sidebar folded it shows just the version, and the full name is its tooltip', (await page.locator('[data-testid=sidebar-version]').innerText()).trim() === `v${release.version}`
    && (await page.locator('[data-testid=sidebar-version]').getAttribute('title')).includes(release.name));
  await page.locator('.sidebar-toggle').click();

  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  await page.locator('[data-testid=about-identity]').waitFor({ timeout: 15_000 });
  const fact = (name) => page.locator(`[data-testid=about-identity] [data-fact="${name}"]`).innerText();
  check('CH-6a the About page shows the full name, short name, version, channel, developer and copyright exactly as in release/release.json',
    (await page.locator('h2', { hasText: release.name }).count()) === 1 && (await fact('shortName')) === release.shortName && (await fact('version')) === release.version
    && (await fact('channel')) === release.channel && (await fact('developer')) === release.developer && (await fact('copyright')) === release.copyright);
  await page.locator('[data-testid=about-technology]').locator('[data-fact=schema]').waitFor({ timeout: 15_000 });
  const tech = async (name) => page.locator(`[data-testid=about-technology] [data-fact="${name}"]`).innerText();
  check('CH-6b it shows the technology it runs on, offline: Electron and Chromium (from the shell), Java, Spring Boot, SQLite, the database schema number and Windows',
    (await tech('shell')).startsWith('Electron ') && /\d/.test(await tech('chromium')) && (await tech('java')).startsWith('21') && /\d/.test(await tech('spring')) && /\d/.test(await tech('sqlite'))
    && (await tech('schema')) === String(latestSchemaVersion()) && /Windows/.test(await tech('os')), `${await tech('shell')} | java ${await tech('java')} | schema ${await tech('schema')}`);
  check('CH-6c the database schema number is shown apart from the program version (they are different things)', (await tech('schema')) !== release.version);
  await shot('05-about');

  // ---- 3. the readiness list ------------------------------------------------------------------------------------------------------------------------
  const expected = { development: acceptance.filter((i) => i.development === 'COMPLETED').length, configuration: acceptance.filter((i) => i.pending === 'CONFIGURATION').length,
    information: acceptance.filter((i) => i.pending === 'OFFICIAL_INFORMATION').length, physical: acceptance.filter((i) => i.pending === 'PHYSICAL_TESTING').length };
  const chip = async (state) => (await page.locator(`[data-testid=readiness-summary] [data-state=${state}] strong`).innerText()).trim();
  await page.locator('[data-testid=readiness-summary]').waitFor({ timeout: 15_000 });
  check('CH-7a the five states are shown apart, with counts that match the shipped list: built, configuration pending, official information pending, physical testing pending, accepted by the school',
    (await chip('development')) === String(expected.development) && (await chip('configuration')) === String(expected.configuration) && (await chip('information')) === String(expected.information)
    && (await chip('physical')) === String(expected.physical) && (await chip('final')) === '0', JSON.stringify(expected));
  check('CH-7b every item is listed with the Khmer title, what closes it, and its own state; none starts accepted',
    (await page.locator('[data-testid^=acceptance-row-]').count()) === acceptance.length && (await page.locator('[data-testid^=acceptance-row-][data-state=FINAL_ACCEPTANCE_COMPLETED]').count()) === 0);
  const unfinished = acceptance.filter((i) => i.development !== 'COMPLETED');
  for (const i of unfinished) {
    check(`CH-7c "${i.id}" is not built yet, so it cannot be signed off (the button is disabled)`, await page.locator(`[data-testid="signoff-${i.id}"]`).isDisabled());
  }
  await page.locator('[data-testid="signoff-usb-backup"]').click();
  await modalEl().locator('[data-testid=signoff-modal]').waitFor({ timeout: 15_000 });
  check('CH-8a signing off asks first: the explanation is shown and "Sign" stays disabled until the box is ticked', await modalEl().locator('[data-testid=signoff-submit]').isDisabled());
  await shot('06-signoff-modal');
  await modalEl().locator('[data-testid=signoff-note]').fill('សាកល្បងជាមួយដុំ USB របស់សាលា');
  await modalEl().locator('[data-testid=signoff-confirm]').check();
  await modalEl().locator('[data-testid=signoff-submit]').click();
  await page.locator('[data-testid="acceptance-row-usb-backup"][data-state=FINAL_ACCEPTANCE_COMPLETED]').waitFor({ timeout: 15_000 });
  const info = await page.locator('[data-testid="acceptance-row-usb-backup"] [data-testid=signoff-info]').innerText();
  check('CH-8b after signing, the row says WHO accepted it and WHEN, with the note, and the "final accepted" count is 1 (everything else is untouched)',
    info.includes('អ្នកគ្រប់គ្រង សុខា') && info.includes('សាកល្បងជាមួយដុំ USB') && (await chip('final')) === '1' && (await chip('physical')) === String(expected.physical - 1));
  await shot('07-signed');
  await page.locator('[data-testid="withdraw-usb-backup"]').click();
  await page.locator('[data-testid="acceptance-row-usb-backup"][data-state=PHYSICAL_TESTING_PENDING]').waitFor({ timeout: 15_000 });
  check('CH-8c the sign-off can be withdrawn, and it goes back to "physical testing pending"', (await chip('final')) === '0' && (await chip('physical')) === String(expected.physical));
  await goTo('/settings/audit', page.locator('[data-testid=audit-page]'));
  await page.locator('[data-testid=audit-row]').first().waitFor({ timeout: 15_000 });
  const actions = await page.locator('[data-testid=audit-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-action')));
  check('CH-8d both the sign-off and its withdrawal are in the audit trail, in Khmer', actions.includes('ACCEPTANCE_SIGNED_OFF') && actions.includes('ACCEPTANCE_WITHDRAWN')
    && (await page.locator('main').innerText()).includes(t('audit.action.ACCEPTANCE_SIGNED_OFF')));

  // ---- 4. placeholders say so until signed off -------------------------------------------------------------------------------------------------
  await goTo('/settings/grading', heading(t('grading.title')));
  await page.locator('[data-testid=draft-grading-rules]').waitFor({ timeout: 15_000 });
  check('CH-9a the grading page says the rules are a placeholder, not official, while the item is not signed off', (await page.locator('[data-testid=draft-grading-rules]').innerText()).includes(t('acceptance.draft.gradingRules').slice(0, 30)));
  await goTo('/settings/reports', heading(t('reportOptions.title')));
  check('CH-9b the printed-report options say the national header wording has not been checked against an official document', await page.locator('[data-testid=draft-national-header]').isVisible());
  await goTo('/settings/fees', heading(t('fees.settingsTitle')));
  check('CH-9c the fee settings say the currency is waiting for the school', await page.locator('[data-testid=draft-fee-currency]').isVisible());
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  await page.locator('[data-testid="signoff-grading-rules"]').click();
  await modalEl().locator('[data-testid=signoff-confirm]').check();
  await modalEl().locator('[data-testid=signoff-submit]').click();
  await page.locator('[data-testid="acceptance-row-grading-rules"][data-state=FINAL_ACCEPTANCE_COMPLETED]').waitFor({ timeout: 15_000 });
  await goTo('/settings/grading', heading(t('grading.title')));
  check('CH-9d once the administrator signs the grading rules off, the notice is gone (and only that notice: the others stay)', (await page.locator('[data-testid=draft-grading-rules]').count()) === 0);
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  await page.locator('[data-testid="withdraw-grading-rules"]').click();
  await page.locator('[data-testid="acceptance-row-grading-rules"][data-state=OFFICIAL_INFORMATION_PENDING]').waitFor({ timeout: 15_000 });
  await goTo('/settings/grading', heading(t('grading.title')));
  check('CH-9e withdrawing brings the notice back', await page.locator('[data-testid=draft-grading-rules]').isVisible());

  // ---- 5. attendance sessions: the school's timetable changes, so the sessions are data the administrator keeps -------------------------------
  // Data is seeded through the backend's own REST API (a second login for the test); everything that is checked is then done through the real UI.
  let apiToken = null;
  const rest = (method, apiPath, body) => page.evaluate(async ({ method, apiPath, body, token }) => {
    const info = await window.desktop.getInfo();
    const res = await fetch(`${info.backendBaseUrl}/api/v1${apiPath}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }, { method, apiPath, body, token: apiToken });
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
  apiToken = (await rest('POST', '/auth/login', { username: 'admin.sokha', password: PW })).json.token;
  const year = (await rest('POST', '/academic-years', { nameKm: 'ឆ្នាំសាកល្បង', startDate: dayOffset(-60), endDate: dayOffset(200), makeCurrent: true })).json;
  const gradeId = (await rest('GET', '/grades')).json[0].id;
  const classId = (await rest('POST', '/classes', { academicYearId: year.id, gradeId, nameKm: 'ក', capacity: null, homeroomTeacherId: null, shift: null })).json.schoolClass.id;
  for (const [name, gender] of [['សិស្ស មួយ', 'MALE'], ['សិស្ស ពីរ', 'FEMALE'], ['សិស្ស បី', 'MALE']]) {
    const s = await rest('POST', '/students', { nameKm: name, gender, dateOfBirth: '2019-01-01', enrollmentDate: null, classId, allowDuplicate: false, guardians: [] });
    if (s.status !== 201) throw new Error(`seeding a student failed: ${s.status}`);
  }

  const WHOLE = 'ពេញមួយថ្ងៃ', MORNING = 'ពេលព្រឹក', AFTERNOON = 'ពេលរសៀល', RENAMED = 'ព្រឹកថ្មី';
  const periodRow = (name) => page.locator(`[data-testid=period-row][data-period="${name}"]`);
  /** Waits until the row shows the SAVED name and times (a row with the same name can already be there before the save has come back). */
  const rowShows = (name, start, end) => page.waitForFunction(({ name, range }) => {
    const row = [...document.querySelectorAll('[data-testid=period-row]')].find((r) => r.getAttribute('data-period') === name);
    return !!row && row.textContent.includes(range) && !document.querySelector('[data-testid=period-form]');
  }, { name, range: `${start}–${end}` }, { timeout: 15_000 });
  const addPeriod = async (name, start, end) => {
    await page.locator('[data-testid=period-add]').click();
    await field('nameKm').fill(name);
    await field('startTime').fill(start);
    await field('endTime').fill(end);
    await page.locator('[data-testid=period-save]').click();
    await rowShows(name, start, end);
  };
  const editPeriod = async (from, name, start, end) => {
    await periodRow(from).locator('[data-testid=period-edit]').click();
    await field('nameKm').fill(name);
    await field('startTime').fill(start);
    await field('endTime').fill(end);
    await page.locator('[data-testid=period-save]').click();
    await rowShows(name, start, end);
  };
  const toast = (text) => page.locator('.toast', { hasText: text }).first();

  await goTo('/settings/attendance-sessions', page.locator('[data-testid=period-table]'));
  await periodRow(WHOLE).waitFor({ timeout: 15_000 });
  check('CH-13a a year starts with one session, the whole day, with no times and nothing to confirm (nothing is invented)',
    (await page.locator('[data-testid=period-row]').count()) === 1 && (await periodRow(WHOLE).innerText()).includes(t('attendancePeriods.noTimes')) && (await periodRow(WHOLE).locator('[data-testid=period-unconfirmed]').count()) === 0);
  check('CH-13b the page says the actual schedule is still waiting for the school, until the administrator signs the item off', await page.locator('[data-testid=draft-attendance-sessions]').isVisible());
  await shot('09-sessions-start');

  await page.locator('[data-testid=period-add]').click();
  await field('nameKm').fill('ក');
  await field('startTime').fill('07:00');
  await page.locator('[data-testid=period-save]').click();
  await page.locator('[data-testid=period-form] .field-error').first().waitFor({ timeout: 10_000 });
  check('CH-13c the times are both or neither: a start without an end is refused next to the field, and nothing is saved',
    (await page.locator('[data-testid=period-form] .field-error').first().innerText()).includes(t('validation.REQUIRED')) && (await page.locator('[data-testid=period-row]').count()) === 1);
  await field('endTime').fill('06:00');
  await page.locator('[data-testid=period-save]').click();
  await page.locator('[data-testid=period-form] .field-error', { hasText: t('validation.END_TIME_BEFORE_START') }).waitFor({ timeout: 10_000 });
  check('CH-13d an end before the start is refused next to the field, and still nothing is saved', (await page.locator('[data-testid=period-row]').count()) === 1);
  await page.getByRole('button', { name: t('common.cancel'), exact: true }).click();

  await addPeriod(MORNING, '07:00', '11:00');
  await addPeriod(AFTERNOON, '13:00', '17:00');
  const order = await page.locator('[data-testid=period-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-period')));
  check('CH-14a the administrator adds Morning and Afternoon as custom sessions, in the order they were made', order.join('|') === [WHOLE, MORNING, AFTERNOON].join('|'), order.join('|'));
  check('CH-14b sessions with times start unconfirmed: the page shows "not confirmed yet" (an example time is not the school\'s timetable)',
    (await periodRow(MORNING).locator('[data-testid=period-unconfirmed]').isVisible()) && (await periodRow(AFTERNOON).locator('[data-testid=period-unconfirmed]').isVisible()));
  await periodRow(MORNING).locator('[data-testid=period-confirm]').click();
  await periodRow(MORNING).locator('[data-testid=period-confirmed]').waitFor({ timeout: 15_000 });
  check('CH-14c confirming says who confirmed and when, and removes the badge (the other session is untouched)',
    (await periodRow(MORNING).locator('[data-testid=period-confirmed]').innerText()).includes('អ្នកគ្រប់គ្រង សុខា') && (await periodRow(MORNING).locator('[data-testid=period-unconfirmed]').count()) === 0
    && (await periodRow(AFTERNOON).locator('[data-testid=period-unconfirmed]').isVisible()));
  await editPeriod(MORNING, MORNING, '07:30', '11:30');
  check('CH-14d changing the times takes the confirmation back (the new times are a new claim)',
    (await periodRow(MORNING).locator('[data-testid=period-unconfirmed]').isVisible()) && (await periodRow(MORNING).innerText()).includes('07:30–11:30'));
  await shot('10-sessions-three');

  // taking attendance with sessions
  await goTo('/attendance', heading(t('attendance.title')));
  await page.locator('[data-testid=session-choice]').waitFor({ timeout: 20_000 });
  const labels = () => page.locator('[data-testid=session-choice] label').evaluateAll((ls) => ls.map((l) => l.getAttribute('data-session')));
  check('CH-15a with several sessions the screen offers them as buttons, in the school day\'s order, and none is ticked yet', (await labels()).join('|') === [WHOLE, MORNING, AFTERNOON].join('|')
    && (await page.locator('[data-testid=session-choice] label[data-recorded=true]').count()) === 0);
  check('CH-15b it opens on the first session (the whole day) and shows its name', (await page.locator('[data-testid=session-choice] input:checked + label').getAttribute('data-session')) === WHOLE);
  await page.getByRole('button', { name: t('attendance.markAllPresent') }).click();
  await button(t('common.save')).click();
  await page.locator(`[data-testid=session-choice] label[data-session="${WHOLE}"][data-recorded=true]`).waitFor({ timeout: 15_000 });
  check('CH-15c after saving, that session shows a tick; the others do not', (await page.locator('[data-testid=session-choice] label[data-recorded=true]').count()) === 1);

  await page.locator(`[data-testid=session-choice] label[data-session="${MORNING}"]`).click();
  await page.locator('[data-testid=attendance-copy]').waitFor({ timeout: 15_000 });
  check('CH-15d a session with nothing recorded offers to start from another one taken today', (await page.locator('[data-testid=attendance-copy-from] option').count()) === 2 && (await page.locator('[data-testid=attendance-recorded]').count()) === 0);
  await page.locator('[data-testid=attendance-copy-from]').selectOption({ label: WHOLE });
  await page.locator('[data-testid=attendance-copy-go]').click();
  await page.waitForFunction((txt) => document.querySelector('[data-testid=attendance-counts]')?.textContent?.includes(txt), `${t('attendance.status.PRESENT')} 3`, { timeout: 10_000 });
  check('CH-15e copying fills the choices (3 present) without saving anything yet', (await page.locator('[data-testid=attendance-recorded]').count()) === 0);
  await page.locator('tr[data-student] label', { hasText: t('attendance.status.ABSENT') }).first().click();
  await button(t('common.save')).click();
  await page.locator(`[data-testid=session-choice] label[data-session="${MORNING}"][data-recorded=true]`).waitFor({ timeout: 15_000 });
  check('CH-15f the morning is saved on its own (one student absent there, present in the whole day) and gets its tick', (await page.locator('[data-testid=session-choice] label[data-recorded=true]').count()) === 2);

  await page.locator('#attendance-tab-history').click();
  await page.locator('label[data-basis=SESSION]').click();   // the history starts on the school's official method (days); the sessions view is one click away
  await page.locator('[data-testid=history-day]').first().waitFor({ timeout: 15_000 });
  const days = await page.locator('[data-testid=history-session]').allInnerTexts();
  check('CH-15g the history lists each session of the day, with the name the sheet was saved with', days.length === 2 && days.includes(WHOLE) && days.includes(MORNING), days.join('|'));
  await page.locator('#attendance-tab-take').click();
  await shot('11-attendance-sessions');

  // the choice is remembered, and renaming a session never rewrites a sheet already taken
  await goTo('/settings/attendance-sessions', page.locator('[data-testid=period-table]'));
  await editPeriod(MORNING, RENAMED, '08:00', '12:00');
  await goTo('/attendance', heading(t('attendance.title')));
  await page.locator('[data-testid=session-choice]').waitFor({ timeout: 20_000 });
  check('CH-16a coming back, the screen opens on the session used last (the morning, now renamed)', (await page.locator('[data-testid=session-choice] input:checked + label').getAttribute('data-session')) === RENAMED);
  await page.locator('[data-testid=attendance-session-label]').waitFor({ timeout: 15_000 });
  const label = await page.locator('[data-testid=attendance-session-label]').innerText();
  check('CH-16b the sheet taken before the rename keeps the name and times it was saved with, and the screen says the session is called something else now',
    label.includes(`${MORNING} (07:30–11:30)`) && label.includes(RENAMED) && (await page.locator('[data-testid=attendance-saved-as]').isVisible()), label.replace(/\s+/g, ' '));
  await page.locator('#attendance-tab-history').click();
  await page.locator('label[data-basis=SESSION]').click();
  await page.locator('[data-testid=history-day]').first().waitFor({ timeout: 15_000 });
  const daysAfter = await page.locator('[data-testid=history-session]').allInnerTexts();
  check('CH-16c the history still says "ពេលព្រឹក" for that sheet, never the new name', daysAfter.includes(MORNING) && !daysAfter.includes(RENAMED), daysAfter.join('|'));
  await page.locator('#attendance-tab-take').click();

  // switching off, deleting, and the last one
  await goTo('/settings/attendance-sessions', page.locator('[data-testid=period-table]'));
  await periodRow(AFTERNOON).locator('[data-testid=period-switch]').click();
  await periodRow(AFTERNOON).locator('[data-testid=period-off]').waitFor({ timeout: 15_000 });
  check('CH-17a a session can be switched off (it is greyed and marked); it was never used', (await periodRow(AFTERNOON).locator('[data-testid=period-delete]').count()) === 1);
  check('CH-17b a session that has sheets cannot be deleted (only switched off): there is no delete button, and the page says why',
    (await periodRow(RENAMED).locator('[data-testid=period-delete]').count()) === 0 && (await periodRow(RENAMED).innerText()).includes(t('attendancePeriods.inUseShort')));
  await periodRow(AFTERNOON).locator('[data-testid=period-delete]').click();
  await modalEl().getByRole('button', { name: t('attendancePeriods.delete'), exact: true }).click();
  await periodRow(AFTERNOON).waitFor({ state: 'detached', timeout: 15_000 });
  check('CH-17c an unused session is deleted after a question', (await page.locator('[data-testid=period-row]').count()) === 2);
  await periodRow(WHOLE).locator('[data-testid=period-switch]').click();
  await periodRow(WHOLE).locator('[data-testid=period-off]').waitFor({ timeout: 15_000 });
  await periodRow(RENAMED).locator('[data-testid=period-switch]').click();
  await toast(t('error.LAST_ENABLED_PERIOD')).waitFor({ timeout: 10_000 });
  check('CH-17d the last session that is switched on cannot be switched off: attendance always has a session to take',
    (await periodRow(RENAMED).locator('[data-testid=period-off]').count()) === 0 && (await periodRow(RENAMED).locator('[data-testid=period-switch]').isChecked()));
  await periodRow(WHOLE).locator('[data-testid=period-switch]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=period-row] [data-testid=period-off]').length === 0, null, { timeout: 15_000 });
  await periodRow(RENAMED).locator('[data-testid=period-switch]').click();
  await periodRow(RENAMED).locator('[data-testid=period-off]').waitFor({ timeout: 15_000 });

  await goTo('/attendance', heading(t('attendance.title')));
  await page.locator('[data-testid=session-choice]').waitFor({ timeout: 20_000 });
  check('CH-18a a switched-off session that has a sheet today is still offered (marked off), so the sheet can be read and corrected',
    (await labels()).join('|') === [WHOLE, RENAMED].join('|') && (await page.locator(`[data-testid=session-choice] label[data-session="${RENAMED}"]`).innerText()).includes(t('attendance.sessionOff')));
  await page.locator('#attendance-date').fill(dayOffset(-1));
  await page.locator('[data-testid=session-choice]').waitFor({ state: 'detached', timeout: 15_000 });
  check('CH-18b on a day with no sheets only the sessions that are switched on count: one session, so no choice is shown at all', (await page.locator('[data-testid=session-choice]').count()) === 0);
  await shot('12-attendance-one-session');

  // built, but the school has not confirmed its real schedule: only the administrator's sign-off says so, and it can be taken back
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  check('CH-18c the sessions are built, so the readiness list lets the administrator sign them off; the item is still "configuration pending" until then',
    (await page.locator('[data-testid="signoff-attendance-sessions"]').isEnabled()) && (await page.locator('[data-testid="acceptance-row-attendance-sessions"][data-state=CONFIGURATION_PENDING]').count()) === 1);
  await page.locator('[data-testid="signoff-attendance-sessions"]').click();
  await modalEl().locator('[data-testid=signoff-confirm]').check();
  await modalEl().locator('[data-testid=signoff-submit]').click();
  await page.locator('[data-testid="acceptance-row-attendance-sessions"][data-state=FINAL_ACCEPTANCE_COMPLETED]').waitFor({ timeout: 15_000 });
  await goTo('/settings/attendance-sessions', page.locator('[data-testid=period-table]'));
  check('CH-18d once signed off, the "schedule not confirmed" notice is gone from the sessions page', (await page.locator('[data-testid=draft-attendance-sessions]').count()) === 0);
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  await page.locator('[data-testid="withdraw-attendance-sessions"]').click();
  await page.locator('[data-testid="acceptance-row-attendance-sessions"][data-state=CONFIGURATION_PENDING]').waitFor({ timeout: 15_000 });

  await goTo('/settings/audit', page.locator('[data-testid=audit-page]'));
  await page.locator('[data-testid=audit-row]').first().waitFor({ timeout: 15_000 });
  const periodActions = await page.locator('[data-testid=audit-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-action')).filter((a) => a.startsWith('ATTENDANCE_PERIOD_')));
  check('CH-19 every change to the sessions is in the audit trail, in Khmer', ['CREATED', 'UPDATED', 'CONFIRMED', 'DISABLED', 'ENABLED', 'DELETED'].every((a) => periodActions.includes(`ATTENDANCE_PERIOD_${a}`))
    && (await page.locator('main').innerText()).includes(t('audit.action.ATTENDANCE_PERIOD_CREATED')), [...new Set(periodActions)].join(','));

  // ---- 6. the report card template: the school has not given its real card, so what the card has is the school's choice -----------------------
  const roster = (await rest('GET', `/classes/${classId}/students`)).json;
  const EXAM = 'ប្រឡងសាកល្បងគំរូ';
  // twelve subjects (the fullest card a page must hold): add subjects until the school's list has twelve, THEN make the examination (it starts with every subject)
  const activeSubjects = (await rest('GET', '/subjects')).json.filter((s) => s.active);
  for (let i = activeSubjects.length; i < 12; i++) await rest('POST', '/subjects', { nameKm: `មុខវិជ្ជាបន្ថែម ${i + 1}`, nameEn: null });
  const exam = (await rest('POST', '/examinations', { academicYearId: year.id, nameKm: EXAM, kind: 'MONTHLY', termNo: 1, startDate: null, endDate: null })).json;
  const examSubjects = (await rest('GET', `/examinations/${exam.id}/subjects`)).json;
  const subjectNames = examSubjects.map((s) => s.subjectName);
  if (examSubjects.length < 12) throw new Error(`the examination has ${examSubjects.length} subjects, not twelve`);
  for (const subject of examSubjects.slice(0, 2)) {
    const saved = await rest('PUT', `/examinations/${exam.id}/scores`, { classId, subjectId: subject.subjectId, scores: roster.map((r, i) => ({ enrollmentId: r.enrollmentId, score: 6 + i, absent: false, remark: null })) });
    if (saved.status !== 200) throw new Error(`seeding scores failed: ${saved.status}`);
  }
  await rest('PUT', '/settings/app', { 'report.moeysHeader': 'true' });   // the national header exists; the card may leave it out
  const photoStudent = roster[0];
  const photoSaved = await page.evaluate(async ({ studentId, token }) => {
    const info = await window.desktop.getInfo();
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 150;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3b82a0';
    ctx.fillRect(0, 0, 120, 150);
    ctx.fillStyle = '#fff';
    ctx.fillRect(40, 30, 40, 40);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const form = new FormData();
    form.append('file', new File([blob], 'photo.png', { type: 'image/png' }));
    const res = await fetch(`${info.backendBaseUrl}/api/v1/students/${studentId}/photo`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    return res.status;
  }, { studentId: photoStudent.studentId, token: apiToken });
  if (photoSaved !== 200) throw new Error(`seeding a photo failed: ${photoSaved}`);

  const opt = (id) => page.locator(`#card-opt-${id}`);
  const preview = page.locator('[data-testid=card-template-preview]');
  const saveTemplate = page.locator('[data-testid=card-template-save]');
  const setSwitch = async (id, on) => { if ((await opt(id).isChecked()) !== on) await opt(id).click(); };
  const openTemplate = async () => { await goTo('/settings/report-card', page.locator('[data-testid=card-template-form]')); await preview.locator('.report-card').waitFor({ timeout: 15_000 }); };
  const applyAndSave = async (changes) => {
    for (const [id, on] of Object.entries(changes.switches ?? {})) await setSwitch(id, on);
    if (changes.signatures !== undefined) await page.selectOption('#card-opt-signatures', String(changes.signatures));
    for (const [i, text] of Object.entries(changes.captions ?? {})) await opt(`caption-${i}`).fill(text);
    if (changes.footnote !== undefined) await opt('footnote').fill(changes.footnote);
    if (changes.order !== undefined) await page.selectOption('#card-opt-order', changes.order);
    await saveTemplate.click();
    await toast(t('reportCardTemplate.saved')).waitFor({ timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=card-template-save]')?.disabled === true, null, { timeout: 10_000 });
  };
  /** The printed cards of the class, reached the way a person reaches them; leaves the print screen with Back. */
  const printed = async (fn) => {
    await goTo('/report-cards', heading(t('reportCards.title')));
    await page.locator('#card-exam').selectOption({ label: EXAM });
    await page.locator('[data-testid=cards-table] tbody tr[data-student]').first().waitFor({ timeout: 15_000 });
    await page.locator('[data-testid=print-all]').click();
    await page.waitForFunction(() => document.querySelectorAll('.report-card').length === 3, null, { timeout: 20_000 });
    await page.waitForTimeout(600);
    const result = await fn();
    await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
    await heading(t('reportCards.title')).waitFor({ timeout: 15_000 });
    return result;
  };
  const inCards = (testid) => page.locator(`.report-card [data-testid=${testid}]`).count();

  await openTemplate();
  check('CH-20a before anything is changed the form shows today\'s card (every block on, the photo off, one signature box, no note) and cannot be saved; the "official sample pending" notice is shown',
    (await opt('logo').isChecked()) && (await opt('national').isChecked()) && !(await opt('photo').isChecked()) && (await opt('attendance').isChecked()) && (await opt('rank').isChecked()) && (await opt('comment').isChecked())
    && (await opt('signatures').inputValue()) === '1' && (await opt('footnote').inputValue()) === '' && (await saveTemplate.isDisabled()) && (await page.locator('[data-testid=draft-report-card-template]').isVisible()));
  const previewHas = async (testid) => preview.locator(`[data-testid=${testid}]`).count();
  check('CH-20b the preview is the real card with made-up data: rank, attendance, comment and one signature box; no photo, no note; the sample says it is only an example',
    (await previewHas('card-rank')) === 1 && (await previewHas('card-attendance')) === 1 && (await previewHas('card-comment')) === 1 && (await previewHas('card-signature')) === 1 && (await previewHas('card-photo')) === 0 && (await previewHas('card-footnote')) === 0
    && (await page.locator('main').innerText()).includes(t('reportCardTemplate.previewHint')));
  await shot('13-card-template-default');

  // everything on, the worst case for the page: photo, three signature boxes and a closing note
  await opt('photo').click();
  await page.selectOption('#card-opt-signatures', '3');
  await opt('caption-2').fill('គ្រូបន្ទុកថ្នាក់');
  await opt('footnote').fill('សូមរក្សាទុកសន្លឹកពិន្ទុនេះ');
  check('CH-20c the preview follows the choices at once: a photo frame, three signature boxes (defaults for 1 and 3, the typed caption for 2) and the note; Save is now possible',
    (await previewHas('card-photo')) === 1 && (await previewHas('card-signature')) === 3 && (await previewHas('card-footnote')) === 1 && !(await saveTemplate.isDisabled())
    && (await preview.locator('[data-testid=card-signature]').allInnerTexts()).map((s) => s.trim()).join('|').includes(`គ្រូបន្ទុកថ្នាក់`)
    && (await preview.locator('[data-testid=card-signature]').last().innerText()).includes(t('print.reportCard.guardian')));
  await shot('14-card-template-everything');
  await saveTemplate.click();
  await toast(t('reportCardTemplate.saved')).waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid=card-template-save]')?.disabled === true, null, { timeout: 10_000 });

  const worst = await printed(async () => {
    await page.waitForFunction(() => document.querySelectorAll('.report-card-photo img').length >= 1, null, { timeout: 20_000 });
    const out = {
      photos: await inCards('card-photo'), withImage: await page.locator('.report-card-photo img').count(), signatures: await inCards('card-signature'), notes: await inCards('card-footnote'),
      rank: await inCards('card-rank'), national: await inCards('print-national'),
    };
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
    await page.addStyleTag({ content: '.print-screen { height: auto !important; overflow: visible !important; }' });
    await page.locator('.report-card').first().screenshot({ path: path.join(outDir, 'changes-15-card-everything.png') });
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = ''; }));   // (hidden only for the picture)
    // the real cards, twelve subjects each: the page's own minimum height lifted, as the card measures itself
    out.tall = await page.evaluate(() => {
      const heights = [...document.querySelectorAll('.report-card')].map((card) => {
        const keep = card.style.minHeight;
        card.style.minHeight = '0';
        const h = card.offsetHeight;
        card.style.minHeight = keep;
        return h;
      });
      return { rows: document.querySelector('.report-card .report-card-scores tbody').querySelectorAll('tr').length, height: Math.max(...heights), compact: document.querySelectorAll('.report-card-compact').length };
    });
    return out;
  });
  check('CH-21a the printed cards follow the saved choices: a photo frame on every card (one with the real picture), three signature boxes and the note on every card',
    worst.photos === 3 && worst.withImage >= 1 && worst.signatures === 9 && worst.notes === 3 && worst.rank === 3, JSON.stringify(worst));
  check('CH-21b the national header (switched on in Printed reports) shows on every card while the card allows it', worst.national === 3);
  check('CH-21c WORST CASE: with the national header, a photo, three signature boxes, a note, the rank, attendance, a comment and twelve REAL subjects, every card fits one A4 page (1122 px): the cards that would not fit as they are switch to the tighter type',
    worst.tall.rows === 12 && worst.tall.height <= 1122, JSON.stringify(worst.tall));
  check('CH-21d ...and the tighter type really was needed there (so the check above is not vacuous)', worst.tall.compact === 3, JSON.stringify(worst.tall));
  await openTemplate();
  await page.locator('#card-opt-twelve').check();
  await preview.locator('.report-card-compact').waitFor({ timeout: 10_000 });
  check('CH-21e the preview with twelve subjects behaves like the printed card: it switches to the tighter type, and says so', (await page.locator('[data-testid=card-template-compact]').count()) === 1);
  await page.locator('#card-opt-twelve').uncheck();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=card-template-preview] .report-card-compact').length === 0, null, { timeout: 10_000 });
  check('CH-21f the five-subject preview of the same choices fits as it is: no tighter type, no note', (await page.locator('[data-testid=card-template-compact]').count()) === 0);
  await shot('16-card-template-everything-saved');

  // the opposite: as little as possible
  await openTemplate();
  await applyAndSave({ switches: { logo: false, national: false, photo: false, attendance: false, rank: false, comment: false }, signatures: 0, footnote: '', order: 'name' });
  const bare = await printed(async () => ({
    rank: await inCards('card-rank'), attendance: await inCards('card-attendance'), comment: await inCards('card-comment'), signatures: await inCards('card-signature'), notes: await inCards('card-footnote'),
    photos: await inCards('card-photo'), national: await inCards('print-national'), footers: await page.locator('.report-card .report-card-footer').count(),
    firstSubject: (await page.locator('.report-card').first().locator('.report-card-scores tbody tr td:nth-child(2)').first().innerText()).trim(),
    draft: await inCards('card-draft-note'),
  }));
  const collator = new Intl.Collator('und', { numeric: true });
  check('CH-22a with every optional block off: no rank, attendance, comment, signature, note, photo or national header; the date line and the "draft rules" line stay',
    bare.rank === 0 && bare.attendance === 0 && bare.comment === 0 && bare.signatures === 0 && bare.notes === 0 && bare.photos === 0 && bare.national === 0 && bare.footers === 3 && bare.draft === 3, JSON.stringify(bare));
  check('CH-22b the subjects are listed by Khmer alphabet when the school chooses it', bare.firstSubject === [...subjectNames].sort(collator.compare)[0], `${bare.firstSubject} vs ${[...subjectNames].sort(collator.compare)[0]}`);

  // and back to the defaults, with one click and a save
  await openTemplate();
  check('CH-23a the saved choices come back when the page is opened again (nothing depends on this browser)', !(await opt('rank').isChecked()) && (await opt('signatures').inputValue()) === '0' && (await opt('order').inputValue()) === 'name');
  await page.locator('[data-testid=card-template-reset]').click();
  check('CH-23b "back to the defaults" only fills the form: it can be saved or left, nothing is saved yet', !(await saveTemplate.isDisabled()) && (await opt('rank').isChecked()) && !(await opt('photo').isChecked()) && (await opt('signatures').inputValue()) === '1');
  await saveTemplate.click();
  await toast(t('reportCardTemplate.saved')).waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid=card-template-save]')?.disabled === true, null, { timeout: 10_000 });
  const back = await printed(async () => ({
    rank: await inCards('card-rank'), attendance: await inCards('card-attendance'), comment: await inCards('card-comment'), signatures: await inCards('card-signature'), notes: await inCards('card-footnote'),
    photos: await inCards('card-photo'), national: await inCards('print-national'),
    firstSubject: (await page.locator('.report-card').first().locator('.report-card-scores tbody tr td:nth-child(2)').first().innerText()).trim(),
  }));
  check('CH-23c after the reset the printed card is today\'s card again: rank, attendance, comment, one signature box, national header, no photo, no note, the list\'s order',
    back.rank === 3 && back.attendance === 3 && back.comment === 3 && back.signatures === 3 && back.notes === 0 && back.photos === 0 && back.national === 3 && back.firstSubject === subjectNames[0], JSON.stringify(back));

  // built, but the school's real card has not been seen: the same sign-off rule as every other placeholder
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  check('CH-24a the template is built, so it can be signed off; until then it is "official information pending"',
    (await page.locator('[data-testid="signoff-report-card-template"]').isEnabled()) && (await page.locator('[data-testid="acceptance-row-report-card-template"][data-state=OFFICIAL_INFORMATION_PENDING]').count()) === 1);
  await page.locator('[data-testid="signoff-report-card-template"]').click();
  await modalEl().locator('[data-testid=signoff-confirm]').check();
  await modalEl().locator('[data-testid=signoff-submit]').click();
  await page.locator('[data-testid="acceptance-row-report-card-template"][data-state=FINAL_ACCEPTANCE_COMPLETED]').waitFor({ timeout: 15_000 });
  await goTo('/settings/report-card', page.locator('[data-testid=card-template-form]'));
  check('CH-24b once signed off the "official sample pending" notice is gone', (await page.locator('[data-testid=draft-report-card-template]').count()) === 0);
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  await page.locator('[data-testid="withdraw-report-card-template"]').click();
  await page.locator('[data-testid="acceptance-row-report-card-template"][data-state=OFFICIAL_INFORMATION_PENDING]').waitFor({ timeout: 15_000 });

  // ---- 7. attendance counted by DAYS and by SESSIONS -------------------------------------------------------------------------------------------
  // Today the class has two sheets (the whole day and the morning). Everybody was present in the first; in the second the first student on the list was absent
  // (CH-15f). So one student has a PARTIAL day: present in one session, absent in the other: one day, never two.
  const PARTIAL_CODE = '2026-0003';
  const unit = (basis) => t(`attendance.unit.${basis}`);
  const summaryOf = async (code) => (await page.locator(`[data-testid=history-summary-row][data-student="${code}"] td`).allInnerTexts()).slice(2).map((s) => s.trim());
  const statusOf = (code) => page.locator(`.report-card[data-student="${code}"] [data-testid=card-attendance] tbody td`).allInnerTexts();
  const openHistory = async () => {
    await goTo('/attendance', heading(t('attendance.title')));
    await page.locator('#attendance-tab-history').click();
    await page.locator('[data-testid=history-summary-row]').first().waitFor({ timeout: 15_000 });
  };

  await openHistory();
  check('CH-25a the history starts on the school\'s official method (days, until it chooses) and says so', (await page.locator('label[data-basis=DAY] input, input#history-basis-DAY').first().isChecked())
    && (await page.locator('label[data-basis=DAY]').innerText()).includes(t('attendance.basis.official')));
  const headers = await page.locator('[data-testid=history-summary] thead th').allInnerTexts();
  check('CH-25b every count column says its unit (ថ្ងៃ) and there is a Partial column', headers.slice(2, 7).every((h) => h.includes(`(${unit('DAY')})`)) && headers.some((h) => h.includes(t('attendance.status.PARTIAL'))) && headers.at(-1).trim() === t('attendance.totalDays'), headers.join('|'));
  check('CH-25c the student present in one session and absent in the other has ONE partial day (0 present, 0 late, 1 partial, 0 absent, 0 leave, 1 day), not two days',
    (await summaryOf(PARTIAL_CODE)).join(',') === '0,0,1,0,0,1', (await summaryOf(PARTIAL_CODE)).join(','));
  check('CH-25d the others have one present day', (await summaryOf('2026-0001')).join(',') === '1,0,0,0,0,1' && (await summaryOf('2026-0002')).join(',') === '1,0,0,0,0,1');
  check('CH-25e the class by date: one day, two sheets, three students (2 present, 1 partial)',
    (await page.locator('[data-testid=history-days] tbody tr').count()) === 1 && (await page.locator('[data-testid=history-days] tbody tr td').allInnerTexts()).slice(1).map((s) => s.trim()).join(',') === '2,2,0,1,0,0,3',
    (await page.locator('[data-testid=history-days] tbody tr td').allInnerTexts()).join(','));
  check('CH-25f the period says 1 day was recorded', (await page.locator('[data-testid=history-recorded]').innerText()).includes(t('attendance.recordedDays').replace('{n}', '1')));
  await shot('17-history-days');
  await page.locator('label[data-basis=SESSION]').click();
  await page.locator('[data-testid=history-sessions]').waitFor({ timeout: 10_000 });
  check('CH-26a the same records by SESSIONS: the same student has 1 present and 1 absent session, 2 sessions in all, and the period says 2 sessions were recorded',
    (await summaryOf(PARTIAL_CODE)).join(',') === '1,1,0,0,2' && (await page.locator('[data-testid=history-recorded]').innerText()).includes(t('attendance.recordedSessions').replace('{n}', '2')), (await summaryOf(PARTIAL_CODE)).join(','));
  check('CH-26b the sessions headings say their unit (វគ្គ), and the sessions table lists both sheets of the day',
    (await page.locator('[data-testid=history-summary] thead th').allInnerTexts()).slice(2, 6).every((h) => h.includes(`(${unit('SESSION')})`)) && (await page.locator('[data-testid=history-sessions] tbody tr').count()) === 2);
  const printHref = await page.locator('[data-testid=history-print]').getAttribute('href');
  check('CH-26c the printed summary link carries the method being shown', printHref.includes('basis=SESSION'), printHref);

  // the printed summary counts the way it is told, and says so
  await page.locator('[data-testid=history-print]').click();
  await page.locator('[data-testid=print-basis]').waitFor({ timeout: 15_000 });
  const printedBySession = await page.locator('.student-sheet').innerText();
  check('CH-26d the printed summary says "by sessions" and its columns say វគ្គ', (await page.locator('[data-testid=print-basis]').innerText()).includes(t('attendance.basis.SESSION')) && printedBySession.includes(`(${unit('SESSION')})`));
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('attendance.title')).waitFor({ timeout: 15_000 });

  // the dashboard follows the OFFICIAL method; so does the report card
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  const split = () => page.locator('[data-testid=stat-attendance-split]').innerText();
  const basisLine = () => page.locator('[data-testid=stat-attendance-basis]').innerText();
  const fill = (key, v) => t(key).replace('{present}', String(v.present)).replace('{late}', String(v.late ?? 0)).replace('{partial}', String(v.partial ?? 0)).replace('{absent}', String(v.absent)).replace('{leave}', String(v.leave ?? 0));
  check('CH-27a the dashboard counts DAYS today: 2 present and 1 partial (three students, one day each), says so, and says 2 sheets were taken',
    (await split()).includes(fill('dashboard.attendanceSplitDays', { present: 2, partial: 1, absent: 0 })) && (await basisLine()).includes(t('attendance.basis.DAY')) && (await basisLine()).includes(t('dashboard.sheetsToday').replace('{n}', '2')), await split());
  await printed(async () => {
    const cells = await statusOf(PARTIAL_CODE);
    check('CH-27b the report card counts days too, by the same official method: 0 present, 0 late, 1 partial, 0 absent, 0 leave, 1 day',
      cells.map((s) => s.trim()).join(',') === '0,0,1,0,0,1' && (await page.locator(`.report-card[data-student="${PARTIAL_CODE}"] [data-testid=card-attendance-title]`).innerText()).includes(t('attendance.basis.DAY')), cells.join(','));
    check('CH-27c the card\'s attendance headings say their unit', (await page.locator(`.report-card[data-student="${PARTIAL_CODE}"] [data-testid=card-attendance] thead th`).allInnerTexts()).slice(0, 5).every((h) => h.includes(`(${unit('DAY')})`)));
  });

  // the school makes SESSIONS its official method: only the numbers shown change
  await goTo('/settings/attendance-sessions', page.locator('[data-testid=official-basis-card]'));
  check('CH-28a the official method is shown as days, and the notice says the school has not chosen yet', (await page.locator('[data-testid=official-basis-current]').innerText()).includes(t('attendance.basis.DAY'))
    && (await page.locator('[data-testid=draft-attendance-counting]').isVisible()) && (await page.locator('[data-testid=official-basis-save]').isDisabled()));
  await page.locator('#official-basis-SESSION').check();
  await page.locator('[data-testid=official-basis-save]').click();
  await toast(t('attendance.basis.saved')).waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid=official-basis-save]')?.disabled === true, null, { timeout: 10_000 });
  check('CH-28b saved: the page now says sessions are official', (await page.locator('[data-testid=official-basis-current]').innerText()).includes(t('attendance.basis.SESSION')));
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  check('CH-28c the dashboard now counts SESSIONS: 5 present and 1 absent session today, and says so',
    (await split()).includes(fill('dashboard.attendanceSplitSessions', { present: 5, absent: 1 })) && (await basisLine()).includes(t('attendance.basis.SESSION')), await split());
  await printed(async () => {
    const cells = await statusOf(PARTIAL_CODE);
    check('CH-28d the report card now counts sessions: 1 present, 1 absent, 0 late, 0 leave, 2 sessions',
      cells.map((s) => s.trim()).join(',') === '1,1,0,0,2' && (await page.locator(`.report-card[data-student="${PARTIAL_CODE}"] [data-testid=card-attendance-title]`).innerText()).includes(t('attendance.basis.SESSION')), cells.join(','));
  });
  await openHistory();
  check('CH-28e the history opens on sessions now, and days are still one click away with the same numbers (the records did not change)',
    (await page.locator('input#history-basis-SESSION').isChecked()) && (await (async () => { await page.locator('label[data-basis=DAY]').click(); return (await summaryOf(PARTIAL_CODE)).join(','); })()) === '0,0,1,0,0,1');

  // the choice is a readiness item of its own: built, but the school's decision is pending until the administrator signs it off
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  check('CH-29a the counting method is its own item in the readiness list: built, and "configuration pending" until the administrator signs it off',
    (await page.locator('[data-testid="signoff-attendance-counting"]').isEnabled()) && (await page.locator('[data-testid="acceptance-row-attendance-counting"][data-state=CONFIGURATION_PENDING]').count()) === 1);
  await page.locator('[data-testid="signoff-attendance-counting"]').click();
  await modalEl().locator('[data-testid=signoff-confirm]').check();
  await modalEl().locator('[data-testid=signoff-submit]').click();
  await page.locator('[data-testid="acceptance-row-attendance-counting"][data-state=FINAL_ACCEPTANCE_COMPLETED]').waitFor({ timeout: 15_000 });
  await goTo('/settings/attendance-sessions', page.locator('[data-testid=official-basis-card]'));
  check('CH-29b once signed off the "school has not chosen" notice is gone', (await page.locator('[data-testid=draft-attendance-counting]').count()) === 0);
  await goTo('/settings/about', page.locator('[data-testid=about-page]'));
  await page.locator('[data-testid="withdraw-attendance-counting"]').click();
  await page.locator('[data-testid="acceptance-row-attendance-counting"][data-state=CONFIGURATION_PENDING]').waitFor({ timeout: 15_000 });
  // back to the default for whatever runs next
  await goTo('/settings/attendance-sessions', page.locator('[data-testid=official-basis-card]'));
  await page.locator('#official-basis-DAY').check();
  await page.locator('[data-testid=official-basis-save]').click();
  await toast(t('attendance.basis.saved')).waitFor({ timeout: 15_000 });

  // ---- 8. the sign-in screen after signing out, and both logs ---------------------------------------------------------------------------------
  await page.locator('.user-menu-toggle').click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: t('nav.signOut') }).first().click();
  await field('username').waitFor({ timeout: 20_000 });
  const login = await page.locator('[data-testid=auth-product]').innerText();
  check('CH-10a the sign-in screen shows the system name and the version', login.includes(release.name) && login.includes(release.version), login.replace(/\s+/g, ' '));
  await shot('08-login');
  const backendLog = readFileSync(D('logs', 'backend.log'), 'utf8');
  const desktopLog = readFileSync(D('logs', 'desktop.log'), 'utf8');
  check('CH-10b backend.log says which release and database schema it started with', backendLog.includes(`${release.shortName} ${release.version} (${release.channel}) ready, database schema ${latestSchemaVersion()}`));
  check('CH-10c desktop.log says which release started', desktopLog.includes(`starting ${release.shortName} ${release.version} (${release.channel})`));
  check('CH-10d no password and no recovery key in either log', !backendLog.includes(PW) && !desktopLog.includes(PW) && !backendLog.includes(key));
  const csp = await page.evaluate(() => window.__csp);
  check('CH-11 no CSP violation, no console error, exactly one deliberate 409, and only app://school and the local backend were contacted', csp.length === 0 && consoleErrors.length === 0 && conflicts.length === 1 && [...origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)),
    [...csp, ...consoleErrors, ...[...origins].filter((o) => o !== 'app://school' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(o))].slice(0, 3).join(' | '));

  const javaPid = Number(readFileSync(D('config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('CH-12 quitting stops the app and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { const p = app?.windows().find((w) => w.url().startsWith('app://school')); if (p) await p.screenshot({ path: path.join(outDir, 'changes-FAIL.png') }); } catch { /* ignore */ }
} finally {
  try { if (app) await app.close(); } catch { /* ignore */ }
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${root}\\\\node_modules\\\\*' } | Stop-Process -Force`], { stdio: 'ignore' }); } catch { /* ignore */ }
  await sleep(500);
  try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
