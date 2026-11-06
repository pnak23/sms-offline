// The weekly timetable in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public), on a fresh install with invented data only:
//   1. it starts EMPTY and says so (no slot, no lesson, the default Monday-Friday week not saved): the class page, the teacher tab, the student's page and Settings > Timetable show their own
//      "no times entered yet" state, never an error; the readiness notice is there until the administrator signs the item off
//   2. Settings > Timetable: the school days (Saturday added), the slots typed through the form (a wrong time and an overlap are refused in Khmer), listed by time, a break, an edit, a delete
//   3. the editor: a lesson needs BOTH a subject and a teacher (Save stays off), the class's own teacher is the default, a clash names the other class, a replacement, a clear, the hidden unused slots
//   4. copying a class: a preview that changes nothing (copied and skipped lessons with the reason of each), then the copy that makes exactly that; the source class is untouched
//   5. the teacher's week with the lesson count; the student's week on the student's page (and the empty state of a student with no class); the teacher's own page
//   6. printing: A4 PORTRAIT by default, one page, the break as one band; LANDSCAPE on request, one page, a landscape page in the real PDF; Back returns to the same choices; the Excel file
//      the real button writes holds the lessons; the student's and the teacher's printouts are one page too
//   7. a new year takes over the days, the slots and the lessons after a preview, and the source year is byte for byte what it was; a CLOSED year is read-only (and can still be read and copied from)
//   8. every change is in the history of changes with the user and the time
//   9. 1366x768 and the Full HD laptop at 100 / 125 / 150 %: the page never scrolls sideways (a week of five or six days fits; the grid has its own scrolling frame)
//  10. nothing is stored in the browser, no CSP violation, no console error, only local origins
// Everything is seeded through the backend's own REST API; everything that is checked is done through the real UI. All people and every time are invented test values: the program ships none.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-timetable.mjs
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktop = path.join(root, 'desktop');
const outDir = path.join(desktop, 'test', 'out');
mkdirSync(outDir, { recursive: true });
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const fill = (text, params) => Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), text);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
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
  // a clash is a 409 and a refused slot is a 422: Chromium logs the failed request, which is expected here and not a program error
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4(01|09|22|29)\b/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('request', (r) => { if (/^(data|blob):/.test(r.url())) return; const u = new URL(r.url()); origins.add(u.protocol + '//' + u.host); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
  const button = (text) => page.getByRole('button', { name: text, exact: true });
  const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
  const goTo = async (href, waitFor) => { await page.locator(`a[href="${href}"]`).first().click(); await waitFor.waitFor({ timeout: 30_000 }); };
  const toast = (text) => page.locator('.toast:visible').filter({ hasText: text });   // an older toast with the same words may still be fading out
  const tid = (id) => page.locator(`[data-testid="${id}"]`);
  const mainWindowCall = (fn, arg) => app.evaluate(({ BrowserWindow }, a) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    return new Function('win', 'a', `return (${a.fn})(win, a.arg)`)(win, a);
  }, { fn: fn.toString(), arg });
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
    await page.screenshot({ path: path.join(outDir, `timetable-e2e-${name}.png`) });
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

  // ---- seed (REST): two years, grade 3 with four main subjects, teachers, three classes, a student in class A and one with no class -------------------
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
  const YEAR = 'ឆ្នាំសាកល្បង ក';
  const YEAR2 = 'ឆ្នាំសាកល្បង ខ';
  const year = must(await rest('POST', '/academic-years', { nameKm: YEAR, startDate: dayOffset(-60), endDate: dayOffset(200), makeCurrent: true }), 'year');
  const year2 = must(await rest('POST', '/academic-years', { nameKm: YEAR2, startDate: dayOffset(300), endDate: dayOffset(500), makeCurrent: false }), 'year 2');
  const grade3 = must(await rest('GET', '/grades'), 'grades').find((g) => g.level === 3);
  const subj = {};
  for (const [key2, name] of [['math', 'គណិតវិទ្យា TT'], ['khmer', 'ភាសាខ្មែរ TT'], ['science', 'វិទ្យាសាស្ត្រ TT'], ['art', 'សិល្បៈ TT']]) subj[key2] = must(await rest('POST', '/subjects', { nameKm: name, nameEn: null, parentId: null }), `subject ${key2}`);
  must(await rest('PUT', `/grades/${grade3.id}/subjects`, { subjectIds: Object.values(subj).map((s) => s.id) }), 'grade subjects');
  const teacher = {};
  for (const [key2, name] of [['t1', 'គ្រូ ទី១ TT'], ['t2', 'គ្រូ ទី២ TT'], ['t3', 'គ្រូ ទី៣ TT'], ['t4', 'គ្រូ ទី៤ TT']]) teacher[key2] = must(await rest('POST', '/teachers', { nameKm: name, gender: 'FEMALE', phone: '', address: '', specialization: '', employmentDate: null }), `teacher ${key2}`);
  const klass = {};
  for (const name of ['ក', 'ខ', 'គ']) klass[name] = must(await rest('POST', '/classes', { academicYearId: year.id, gradeId: grade3.id, nameKm: name, capacity: null, homeroomTeacherId: null, shift: null }), `class ${name}`).schoolClass;
  const assign = async (cls, pairs) => must(await rest('PUT', `/classes/${cls.id}/teachers`, { assignments: pairs.map(([s, tc]) => ({ subjectId: subj[s].id, teacherId: teacher[tc].id })) }), 'assignments');
  await assign(klass['ក'], [['math', 't1'], ['khmer', 't2'], ['science', 't4']]);
  await assign(klass['ខ'], [['math', 't1'], ['khmer', 't3'], ['science', 't4']]);
  await assign(klass['គ'], [['math', 't1'], ['khmer', 't3']]);
  const STUDENT_IN = 'សិស្ស ក្នុងថ្នាក់ TT';
  const STUDENT_OUT = 'សិស្ស គ្មានថ្នាក់ TT';
  const studentIn = must(await rest('POST', '/students', { nameKm: STUDENT_IN, gender: 'FEMALE', dateOfBirth: '2017-01-01', enrollmentDate: null, classId: klass['ក'].id, allowDuplicate: false, guardians: [] }), 'student in').student ?? null;
  const studentOut = must(await rest('POST', '/students', { nameKm: STUDENT_OUT, gender: 'MALE', dateOfBirth: '2017-02-02', enrollmentDate: null, classId: null, allowDuplicate: false, guardians: [] }), 'student out').student;
  await mainWindowCall((win) => { win.unmaximize(); win.setContentSize(1366, 1100); });
  await page.waitForTimeout(500);
  const DAY = (n) => t(`timetable.day.${n}`);
  const classText = (name) => `${grade3.nameKm} ${name}`;
  const settingsOf = async (yearId) => must(await rest('GET', `/timetable/settings?yearId=${yearId}`), 'settings');
  const classView = async (classId) => must(await rest('GET', `/timetable/classes/${classId}`), 'class view');

  // ---- 1. it starts empty, and says so: no slot, no lesson, the default week is not saved --------------------------------------------------------------
  const s0 = await settingsOf(year.id);
  check('TT-0a nothing is invented: a new year has no slot and no lesson, and its days are the default Monday-Friday that nobody saved', s0.slots.length === 0 && s0.lessons === 0 && s0.daysAreDefault === true && s0.days.join() === '1,2,3,4,5');
  check('TT-0b the side menu has the Timetable page and its settings page', (await page.locator('a[href="/timetable"]').count()) >= 1 && (await page.locator('a[href="/settings/timetable"]').count()) >= 1);
  await goTo('/timetable', heading(t('timetable.title')));
  await tid('tt-unconfigured').waitFor({ timeout: 30_000 });
  const noSlotsText = await tid('tt-unconfigured').innerText();
  check('TT-1a the class page with no slots says "no times entered yet" (not an error, no grid), with a link to the settings page', noSlotsText.includes(t('timetable.unconfiguredTitle')) && (await tid('tt-grid').count()) === 0
    && (await page.locator('.alert-danger').count()) === 0 && (await tid('tt-unconfigured').locator('a[href="/settings/timetable"]').count()) === 1);
  await shot('1-empty-class');
  await tid('tt-tab-teacher').click();
  await tid('tt-teacher-pick').selectOption(String(teacher.t1.id));
  await tid('tt-unconfigured').waitFor({ timeout: 15_000 });
  check('TT-1b the teacher tab for a teacher with no lesson and no slots says the same, with the lesson count 0', (await tid('tt-teacher-count').innerText()).includes('0') && (await tid('tt-unconfigured').count()) === 1);
  await tid('tt-tab-class').click();
  await goTo('/settings/timetable', heading(t('timetable.settings.title')));
  await tid('tt-slots-empty').waitFor({ timeout: 30_000 });
  check('TT-1c Settings > Timetable starts with no slot ("no times have been entered; the program never fills in times by itself"), the default week ticked Monday-Friday only, and the readiness notice',
    (await tid('tt-slots-empty').innerText()).includes(t('timetable.settings.emptyTitle')) && (await tid('draft-timetable-slots').count()) === 1
    && (await Promise.all([1, 2, 3, 4, 5, 6, 7].map((d) => tid(`tt-day-${d}`).isChecked()))).join() === 'true,true,true,true,true,false,false' && (await page.getByText(t('timetable.settings.daysDefault')).count()) === 1);
  await shot('1-empty-settings');
  await goTo('/students', heading(t('students.title')));
  await page.getByRole('link', { name: STUDENT_IN }).first().click();
  await tid('student-timetable').waitFor({ timeout: 30_000 });
  await tid('student-timetable-unconfigured').waitFor({ timeout: 15_000 });
  check('TT-1d the student\'s page says there is no timetable yet (the class has no slots), not an error', (await tid('student-timetable-class').innerText()).includes(klass['ក'].nameKm) && (await page.locator('[data-testid=student-timetable] .alert-danger').count()) === 0);

  // ---- 2. Settings > Timetable: the days and the slots, typed by the school -------------------------------------------------------------------------------
  await goTo('/settings/timetable', heading(t('timetable.settings.title')));
  await tid('tt-slots-empty').waitFor({ timeout: 30_000 });
  await tid('tt-day-6').check();
  await tid('tt-days-save').click();
  await toast(t('timetable.settings.daysSaved')).first().waitFor({ timeout: 15_000 });
  const sDays = await settingsOf(year.id);
  check('TT-2a Saturday is added and saved: the year has its own six days now (and says so)', sDays.days.join() === '1,2,3,4,5,6' && sDays.daysAreDefault === false && (await page.getByText(t('timetable.settings.daysChosen')).count()) === 1);
  const addSlot = async (name, start, end, isBreak = false) => {
    await tid('tt-slot-add').click();
    await tid('tt-slot-form').waitFor({ timeout: 10_000 });
    await field('nameKm').fill(name);
    await field('startTime').fill(start);
    await field('endTime').fill(end);
    if (isBreak) await tid('tt-slot-break').check();
    await tid('tt-slot-save').click();
  };
  await addSlot('ម៉ោង ១', '07:00', '06:00');
  await page.waitForTimeout(500);
  check('TT-2b an end before the start is refused in Khmer, next to the field, before anything is sent', (await tid('tt-slot-form').locator('.field-error').allInnerTexts()).some((x) => x.includes(t('validation.END_TIME_BEFORE_START'))) && (await settingsOf(year.id)).slots.length === 0);
  await field('endTime').fill('07:45');
  await tid('tt-slot-save').click();
  await toast(t('timetable.settings.slotCreated')).first().waitFor({ timeout: 15_000 });
  await addSlot('ម៉ោង ៣', '08:45', '09:30');                      // typed out of order on purpose
  await toast(t('timetable.settings.slotCreated')).nth(0).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(300);
  await addSlot('ម៉ោង ២', '07:30', '08:30');                      // overlaps the first slot: the server refuses it
  await page.waitForTimeout(800);
  check('TT-2c a slot that overlaps another one is refused by the server and shown in Khmer at its time field', (await tid('tt-slot-form').locator('.field-error').allInnerTexts()).some((x) => x.includes(t('validation.TIMETABLE_SLOT_OVERLAP'))) && (await settingsOf(year.id)).slots.length === 2);
  await field('startTime').fill('07:45');
  await field('endTime').fill('08:30');
  await tid('tt-slot-save').click();
  await toast(t('timetable.settings.slotCreated')).first().waitFor({ timeout: 15_000 });
  await addSlot('សម្រាក', '08:30', '08:45', true);
  await toast(t('timetable.settings.slotCreated')).first().waitFor({ timeout: 15_000 });
  await addSlot('បន្ថែម', '10:00', '10:30');
  await toast(t('timetable.settings.slotCreated')).first().waitFor({ timeout: 15_000 });
  await page.locator('[data-slot="បន្ថែម"]').waitFor({ timeout: 15_000 });
  const names = await tid('tt-slot-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-slot')));
  check('TT-2d the slots are listed by time of day (not by when they were typed), the break is marked, and a slot with no lesson can be deleted', names.join('|') === 'ម៉ោង ១|ម៉ោង ២|សម្រាក|ម៉ោង ៣|បន្ថែម'
    && (await page.locator('[data-slot="សម្រាក"]').innerText()).includes(t('timetable.settings.break')) && (await page.locator('[data-slot="បន្ថែម"] [data-testid=tt-slot-delete]').count()) === 1, names.join('|'));
  await page.locator('[data-slot="បន្ថែម"] [data-testid=tt-slot-edit]').click();
  await field('endTime').fill('10:40');
  await tid('tt-slot-save').click();
  await toast(t('timetable.settings.slotUpdated')).first().waitFor({ timeout: 15_000 });
  await page.locator('[data-slot="បន្ថែម"] [data-testid=tt-slot-delete]').click();
  await page.locator('.modal-content:visible').getByRole('button', { name: t('timetable.settings.delete'), exact: true }).click();
  await toast(t('timetable.settings.slotDeleted')).first().waitFor({ timeout: 15_000 });
  const sSlots = await settingsOf(year.id);
  check('TT-2e the edit changed the end time and the delete removed the unused slot: four slots remain (three lessons slots, one break)', sSlots.slots.length === 4 && sSlots.slots.filter((s) => s.breakSlot).length === 1);
  await shot('2-settings');
  const slotId = Object.fromEntries(sSlots.slots.map((s) => [s.nameKm, s.id]));

  // ---- 3. the editor: a lesson needs a subject AND a teacher --------------------------------------------------------------------------------------------
  await goTo('/timetable', heading(t('timetable.title')));
  await tid('tt-class-empty').waitFor({ timeout: 30_000 });
  check('TT-3a a class with no lesson but with slots: "this class has no timetable yet" (an info line, not an error) and the whole week to click, a break as one shaded band',
    (await tid('tt-grid').count()) === 1 && (await tid('tt-row').count()) === 3 && (await tid('tt-break-row').count()) === 1 && (await page.locator('.tt-cell-button').count()) === 3 * 6 && (await page.locator('.alert-danger').count()) === 0);
  await shot('3-empty-grid');
  const cell = (d, s) => tid(`tt-cell-${d}-${slotId[s]}`);
  /** The grid is redrawn a moment after the toast: wait until a cell shows (or, for '', no longer shows) a text. */
  const cellShows = async (d, s, text) => { try { await page.waitForFunction(({ sel, text }) => { const el = document.querySelector(sel); return !!el && (text === '' ? el.innerText.trim() === '' : el.innerText.includes(text)); }, { sel: `[data-testid="tt-cell-${d}-${slotId[s]}"]`, text }, { timeout: 10_000 }); return true; } catch { return false; } };
  await cell(1, 'ម៉ោង ១').click();
  await tid('tt-save').waitFor({ timeout: 10_000 });
  check('TT-3b the cell pop-up: Save is OFF until both a subject and a teacher are chosen, and it says why', (await tid('tt-save').isDisabled()) && (await tid('tt-both-required').count()) === 1);
  await tid('tt-teacher').selectOption(String(teacher.t2.id));
  check('TT-3c a teacher alone is not enough (Save stays off)', await tid('tt-save').isDisabled());
  await page.locator('.modal-content:visible').getByRole('button', { name: t('common.cancel'), exact: true }).click();
  await page.locator('.modal.show').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
  await cell(1, 'ម៉ោង ១').click();
  await tid('tt-subject').waitFor({ timeout: 10_000 });
  await tid('tt-subject').selectOption(String(subj.math.id));
  check('TT-3d choosing the subject fills in the teacher the class has for it (the default), and then Save is on; only the class\'s own teachers are offered', (await tid('tt-teacher').inputValue()) === String(teacher.t1.id) && (await tid('tt-save').isEnabled())
    && (await tid('tt-teacher').locator('option').allInnerTexts()).every((x) => !x.includes(teacher.t3.nameKm)));
  await tid('tt-save').click();
  await toast(t('timetable.cell.saved')).first().waitFor({ timeout: 15_000 });
  await tid('tt-class-count').waitFor({ timeout: 15_000 });
  const filled = await cell(1, 'ម៉ោង ១').innerText();
  check('TT-3e the lesson is saved and shown in its cell: the subject and its teacher, and the page now counts one lesson', filled.includes(subj.math.nameKm) && filled.includes(teacher.t1.nameKm) && (await tid('tt-class-empty').count()) === 0);
  // class B at the same time with the same teacher: a clash that names class A
  await page.locator('select[id^="picker-class-"]').first().selectOption({ label: classText('ខ') });
  await tid('tt-class-empty').waitFor({ timeout: 30_000 });
  await cell(1, 'ម៉ោង ១').click();
  await tid('tt-subject').selectOption(String(subj.math.id));
  await tid('tt-save').click();
  const clashBox = tid('tt-cell-error');
  await clashBox.waitFor({ timeout: 15_000 });
  const clashText = await clashBox.innerText();
  check('TT-3f the same teacher at the same time in another class is refused and the pop-up names the other class, the day and the slot (and stays open)',
    clashText === fill(t('timetable.clash'), { className: classText('ក'), day: DAY(1), slot: 'ម៉ោង ១' }) && (await tid('tt-cell-modal').count()) >= 1 && (await cell(1, 'ម៉ោង ១').innerText()).trim() === '', clashText);
  await shot('3-clash');
  await tid('tt-show-all-teachers').check();
  check('TT-3g "show all active teachers" adds the teachers who do not teach this class', (await tid('tt-teacher').locator('option').allInnerTexts()).some((x) => x.includes(teacher.t3.nameKm)));
  await tid('tt-teacher').selectOption(String(teacher.t3.id));
  await tid('tt-save').click();
  await toast(t('timetable.cell.saved')).first().waitFor({ timeout: 15_000 });
  check('TT-3h with another teacher it is saved (one lesson in each class, no clash)', await cellShows(1, 'ម៉ោង ១', teacher.t3.nameKm));
  // back to A: the rest of the week
  await page.locator('select[id^="picker-class-"]').first().selectOption({ label: classText('ក') });
  await tid('tt-class-count').waitFor({ timeout: 30_000 });
  const place = async (d, s, subject, expectTeacher) => {
    await cell(d, s).click();
    await tid('tt-subject').selectOption(String(subj[subject].id));
    if (expectTeacher) await tid('tt-teacher').selectOption(String(teacher[expectTeacher].id));
    await tid('tt-save').click();
    await toast(t('timetable.cell.saved')).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
  };
  await place(2, 'ម៉ោង ១', 'math');
  await place(3, 'ម៉ោង ១', 'science');
  await place(1, 'ម៉ោង ៣', 'khmer');
  await place(6, 'ម៉ោង ៣', 'art', 't4');
  const viewA = await classView(klass['ក'].id);
  check('TT-3i class A now has 5 lessons (math Mon + Tue, science Wed, Khmer Mon slot 3, art on Saturday): the six-day week works', viewA.grid.lessons.length === 5 && viewA.grid.lessons.some((l) => l.dayOfWeek === 6 && l.subjectId === subj.art.id));
  // an editor draws every slot (a lesson can only be added to a row that is drawn); switching the option off hides the slot this class never uses
  check('TT-3j the editor draws every slot even after lessons exist (3 lesson rows and the break), so a lesson can be added to any of them', (await tid('tt-row').count()) === 3 && (await tid('tt-break-row').count()) === 1 && (await tid('tt-show-all-slots').isChecked()));
  await tid('tt-show-all-slots').uncheck();
  check('TT-3k with the option off the slot this class never uses is not drawn, and the break between the used slots stays', (await tid('tt-row').count()) === 2 && (await tid('tt-break-row').count()) === 1);
  await tid('tt-show-all-slots').check();
  // a replacement (same cell, another subject) and a clear
  await cell(3, 'ម៉ោង ១').click();
  await tid('tt-subject').selectOption(String(subj.khmer.id));
  await tid('tt-save').click();
  await toast(t('timetable.cell.saved')).first().waitFor({ timeout: 15_000 });
  check('TT-3l a cell is replaced, not duplicated: Wednesday slot 1 now holds Khmer with the class\'s Khmer teacher', (await cellShows(3, 'ម៉ោង ១', subj.khmer.nameKm)) && (await cellShows(3, 'ម៉ោង ១', teacher.t2.nameKm))
    && (await classView(klass['ក'].id)).grid.lessons.length === 5);
  await cell(3, 'ម៉ោង ១').click();
  await tid('tt-clear').click();
  await toast(t('timetable.cell.cleared')).first().waitFor({ timeout: 15_000 });
  check('TT-3m "remove the lesson" empties the cell', (await cellShows(3, 'ម៉ោង ១', '')) && (await classView(klass['ក'].id)).grid.lessons.length === 4);
  await place(3, 'ម៉ោង ១', 'science');
  await shot('3-class-a');

  // ---- 4. copying a class: preview first ---------------------------------------------------------------------------------------------------------------
  await page.locator('select[id^="picker-class-"]').first().selectOption({ label: classText('គ') });
  await tid('tt-class-empty').waitFor({ timeout: 30_000 });
  await tid('tt-copy-open').click();
  await tid('tt-copy-source').waitFor({ timeout: 10_000 });
  await tid('tt-copy-source').selectOption({ label: classText('ក') });
  check('TT-4a the copy button is OFF until a preview has been looked at', await tid('tt-copy-go').isDisabled());
  const viewCBefore = await classView(klass['គ'].id);
  await tid('tt-copy-preview').click();
  await tid('tt-copy-result').waitFor({ timeout: 15_000 });
  const copiedRows = await tid('tt-copied-row').count();
  const skipped = await tid('tt-skipped-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-reason')));
  // class C has math t1, Khmer t3, no science, no art: the source A has Mon+Tue math (t1 is in A at those times), Khmer Mon slot 3, science Wed, art Sat
  check('TT-4b the preview lists what WOULD be copied and every skipped lesson with its reason (a clash with the other class, a subject the class has no teacher for) and changes nothing',
    (await tid('tt-copy-summary').innerText()) === fill(t('timetable.copy.previewSummary'), { copied: 1, skipped: 4 }) && copiedRows === 1 && skipped.sort().join() === 'NO_TEACHER_ASSIGNED,NO_TEACHER_ASSIGNED,TEACHER_CLASH,TEACHER_CLASH'
    && (await classView(klass['គ'].id)).grid.lessons.length === viewCBefore.grid.lessons.length && (await tid('tt-copy-result').getAttribute('data-preview')) === 'yes', `copied ${copiedRows}, skipped ${skipped.join()}`);
  const clashDetail = await page.locator('[data-testid=tt-skipped-row][data-reason=TEACHER_CLASH]').first().innerText();
  check('TT-4c a clash row says which class the teacher is in', clashDetail.includes(classText('ក')), clashDetail.replace(/\s+/g, ' '));
  await shot('4-copy-preview');
  await tid('tt-copy-replace').check();
  check('TT-4d a different choice (replace) clears the old preview, so a copy is never made from a preview of something else', (await tid('tt-copy-result').count()) === 0 && (await tid('tt-copy-go').isDisabled()));
  await tid('tt-copy-replace').uncheck();
  await tid('tt-copy-preview').click();
  await tid('tt-copy-result').waitFor({ timeout: 15_000 });
  const sourceBefore = JSON.stringify((await classView(klass['ក'].id)).grid.lessons);
  await tid('tt-copy-go').click();
  await toast(t('timetable.copy.done')).first().waitFor({ timeout: 15_000 });
  const viewC = await classView(klass['គ'].id);
  check('TT-4e the copy makes exactly the previewed lesson (Khmer on Monday with class C\'s own teacher), and the source class is untouched', viewC.grid.lessons.length === 1 && viewC.grid.lessons[0].teacherId === teacher.t3.id
    && viewC.grid.lessons[0].subjectId === subj.khmer.id && JSON.stringify((await classView(klass['ក'].id)).grid.lessons) === sourceBefore);

  // ---- 5. the teacher's week, the student's page, the teacher's own page ------------------------------------------------------------------------------------
  await tid('tt-tab-teacher').click();
  await tid('tt-teacher-pick').selectOption(String(teacher.t1.id));
  await tid('tt-teacher-count').waitFor({ timeout: 15_000 });
  const t1Count = (await classView(klass['ក'].id)).grid.lessons.filter((l) => l.teacherId === teacher.t1.id).length + (await classView(klass['ខ'].id)).grid.lessons.filter((l) => l.teacherId === teacher.t1.id).length;
  check('TT-5a the teacher\'s week shows the total number of lessons in the week (all classes) and their cells name the class', (await tid('tt-teacher-count').innerText()).includes(String(t1Count)) && t1Count === 2
    && (await tid('tt-grid').innerText()).includes(classText('ក')) && (await tid('tt-teacher-pick').locator('option:checked').innerText()).includes(String(t1Count)), `${t1Count} lessons`);
  await shot('5-teacher');
  await goTo('/students', heading(t('students.title')));
  await page.getByRole('link', { name: STUDENT_IN }).first().click();
  await tid('student-timetable').waitFor({ timeout: 30_000 });
  await tid('tt-grid').waitFor({ timeout: 15_000 });
  const stText = await tid('student-timetable').innerText();
  check('TT-5b the student\'s page shows the timetable of the student\'s class (read-only: no cell is a button), with print and Excel', stText.includes(subj.math.nameKm) && stText.includes(teacher.t1.nameKm) && (await page.locator('[data-testid=student-timetable] .tt-cell-button').count()) === 0
    && (await tid('student-timetable-print').count()) === 1 && (await tid('student-timetable-excel').count()) === 1);
  await shot('5-student');
  await goTo('/students', heading(t('students.title')));
  await page.getByRole('link', { name: STUDENT_OUT }).first().click();
  await tid('student-timetable-none').waitFor({ timeout: 30_000 });
  check('TT-5c a student with no class gets a plain sentence, not an error', (await page.locator('[data-testid=student-timetable] .alert-danger').count()) === 0 && (await tid('student-timetable-none').innerText()).includes(YEAR));
  await goTo('/teachers', heading(t('teachers.title')));
  await page.getByRole('link', { name: teacher.t1.nameKm }).first().click();
  await tid('teacher-timetable-count').waitFor({ timeout: 30_000 });
  check('TT-5d the teacher\'s own page shows their lessons in the week', (await tid('teacher-timetable-count').innerText()).includes(String(t1Count)) && (await tid('teacher-timetable').locator('a[href^="/timetable?tab=teacher"]').count()) === 1);

  // ---- 6. printing: A4 portrait by default, landscape on request, one page each, Back returns, the Excel file holds the lessons ---------------------------------
  let pdfNo = 0;
  const pdfInfo = async (keep = null) => {
    const file = path.join(outDir, `timetable-e2e-${keep ?? ++pdfNo}.pdf`);
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('print.savePdf')).click();
    for (let i = 0; i < 60 && !existsSync(file); i++) await sleep(250);
    await sleep(300);
    const pdf = existsSync(file) ? readFileSync(file).toString('latin1') : '';
    if (keep === null) rmSync(file, { force: true });
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf);
    return { pages: pdf.startsWith('%PDF-') ? (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length : -1, w: box ? Number(box[1]) : 0, h: box ? Number(box[2]) : 0 };
  };
  const xlsxStrings = async (name) => {
    const file = path.join(outDir, `timetable-e2e-${name}.xlsx`);
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('reports.excel')).click();
    for (let i = 0; i < 60 && !existsSync(file); i++) await sleep(250);
    await sleep(300);
    if (!existsSync(file) || statSync(file).size < 1500 || readFileSync(file).subarray(0, 2).toString('latin1') !== 'PK') return null;
    const dir = mkdtempSync(path.join(tmpdir(), 'tt-xlsx '));
    try {
      execFileSync(path.join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe'), ['-xf', file, '-C', dir]);   // Windows' own bsdtar reads a zip (a GNU tar on the PATH does not)
      return readFileSync(path.join(dir, 'xl', 'sharedStrings.xml'), 'utf8');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  await goTo('/timetable', heading(t('timetable.title')));
  await tid('tt-by-class').waitFor({ timeout: 30_000 }).catch(() => {});
  if (!(await tid('tt-by-class').count())) await tid('tt-tab-class').click();
  await page.locator('select[id^="picker-class-"]').first().selectOption({ label: classText('ក') });
  await tid('tt-class-count').waitFor({ timeout: 30_000 });
  await tid('tt-print').click();
  await tid('report-sheet').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  const portrait = await page.evaluate(() => { const a = document.querySelector('[data-testid=report-sheet]'); return { w: a.offsetWidth, rows: document.querySelectorAll('[data-testid=report-sheet] tbody tr').length, breaks: document.querySelectorAll('[data-testid=report-break-row]').length, text: a.innerText, table: a.querySelector('table').innerText }; });
  check('TT-6a the printed class timetable: A4 portrait width on screen, the title, one row per slot in use with the break as ONE band, the lessons with their teacher on separate lines',
    Math.abs(portrait.w - 794) < 8 && portrait.text.includes(t('reports.timetableClass.title')) && portrait.rows === 3 && portrait.breaks === 1 && portrait.text.includes(subj.math.nameKm) && portrait.text.includes(teacher.t1.nameKm)
    && !portrait.table.includes('·'), JSON.stringify({ w: portrait.w, rows: portrait.rows, breaks: portrait.breaks }));
  await shot('6-print-portrait');
  const pPortrait = await pdfInfo('class-portrait');
  check('TT-6b the real PDF of it is ONE page and a PORTRAIT A4 page', pPortrait.pages === 1 && pPortrait.h > pPortrait.w && Math.abs(pPortrait.w - 595) < 3, JSON.stringify(pPortrait));
  await tid('print-landscape').check();
  await page.waitForTimeout(600);
  const landscape = await page.evaluate(() => document.querySelector('[data-testid=report-sheet]').offsetWidth);
  const pLandscape = await pdfInfo('class-landscape');
  check('TT-6c with "landscape" on the sheet is A4 landscape wide and the real PDF is ONE LANDSCAPE page', Math.abs(landscape - 1123) < 10 && pLandscape.pages === 1 && pLandscape.w > pLandscape.h && Math.abs(pLandscape.h - 595) < 3, JSON.stringify({ landscape, ...pLandscape }));
  await shot('6-print-landscape');
  const strings = await xlsxStrings('class');
  check('TT-6d the Excel file the real button writes is a real xlsx and holds the lessons, the teachers, the slot labels and the break', !!strings && strings.includes(subj.math.nameKm) && strings.includes(teacher.t1.nameKm) && strings.includes('07:00–07:45') && strings.includes('សម្រាក'));
  await tid('print-landscape').uncheck();
  await button(t('common.back')).click();
  await tid('tt-class-count').waitFor({ timeout: 30_000 });
  check('TT-6e Back returns to the timetable page with the same class chosen (the choices travel in the address)', (await page.locator('select[id^="picker-class-"]').first().locator('option:checked').innerText()).includes(classText('ក')) && (await tid('tt-by-class').count()) === 1);
  // the teacher's printout
  await tid('tt-tab-teacher').click();
  await tid('tt-teacher-pick').selectOption(String(teacher.t1.id));
  await tid('tt-teacher-count').waitFor({ timeout: 15_000 });
  await tid('tt-print').click();
  await tid('report-sheet').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  const tSheet = await page.evaluate(() => document.querySelector('[data-testid=report-sheet]').innerText);
  check('TT-6f the teacher\'s printout is one A4 page, carries the teacher\'s name and the weekly lesson count, and names the classes', tSheet.includes(teacher.t1.nameKm) && tSheet.includes(fill(t('timetable.teacherLessons'), { n: t1Count })) && tSheet.includes(classText('ក')) && (await pdfInfo()).pages === 1);
  await button(t('common.back')).click();
  await tid('tt-teacher-count').waitFor({ timeout: 30_000 });
  check('TT-6g Back returns to the teacher tab with the same teacher chosen', (await tid('tt-teacher-pick').inputValue()) === String(teacher.t1.id));
  // the student's printout, and back to the student's page
  await goTo('/students', heading(t('students.title')));
  await page.getByRole('link', { name: STUDENT_IN }).first().click();
  await tid('student-timetable-print').waitFor({ timeout: 30_000 });
  await tid('student-timetable-print').click();
  await tid('report-sheet').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  const sSheet = await page.evaluate(() => document.querySelector('[data-testid=report-sheet]').innerText);
  check('TT-6h the student\'s printout is one A4 page with the student\'s name, class and year', sSheet.includes(STUDENT_IN) && sSheet.includes(classText('ក')) && sSheet.includes(YEAR) && sSheet.includes(t('reports.timetableStudent.title')) && (await pdfInfo()).pages === 1);
  const stStrings = await xlsxStrings('student');
  check('TT-6i the student\'s Excel file holds the lessons', !!stStrings && stStrings.includes(subj.math.nameKm));
  await button(t('common.back')).click();
  await tid('student-timetable').waitFor({ timeout: 30_000 });
  check('TT-6j Back returns to the student\'s own page', (await page.locator('h1, h2').filter({ hasText: STUDENT_IN }).count()) >= 1 || (await tid('student-timetable').count()) === 1);

  // ---- 7. a new year takes over the days, the slots and the lessons (after a preview); a closed year is read-only ------------------------------------------------
  const classA2 = must(await rest('POST', '/classes', { academicYearId: year2.id, gradeId: grade3.id, nameKm: 'ក', capacity: null, homeroomTeacherId: null, shift: null }), 'class A in year 2').schoolClass;
  await assign(classA2, [['math', 't1'], ['khmer', 't2']]);
  // (the 'closed' flag is not part of what is compared: the year is closed between the two looks)
  const sourceSnapshot = async () => JSON.stringify([{ ...(await settingsOf(year.id)), yearClosed: undefined }, (await classView(klass['ក'].id)).grid.lessons, (await classView(klass['ខ'].id)).grid.lessons, (await classView(klass['គ'].id)).grid.lessons]);
  const srcBefore = await sourceSnapshot();
  await goTo('/settings/timetable', heading(t('timetable.settings.title')));
  await tid('tt-year').waitFor({ timeout: 30_000 });
  await tid('tt-year').selectOption(String(year2.id));
  await tid('tt-slots-empty').waitFor({ timeout: 15_000 });
  check('TT-7a the new year starts empty too (no slot, the default week) and offers to take over another year', (await tid('tt-year-copy').count()) === 1 && (await settingsOf(year2.id)).slots.length === 0);
  await tid('tt-copy-year').selectOption(String(year.id));
  await tid('tt-year-preview').click();
  await tid('tt-copy-result').waitFor({ timeout: 15_000 });
  const yCopied = await tid('tt-copied-row').count();
  const ySkipped = await tid('tt-skipped-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-reason')));
  check('TT-7b the year preview lists the lessons of the class that exists in both years and skips the other classes\' lessons with the reason; it wrote nothing', (await tid('tt-copy-slots').innerText()).includes('4')
    && yCopied === 5 && ySkipped.length === 2 && ySkipped.every((r) => r === 'CLASS_NOT_IN_YEAR') && (await settingsOf(year2.id)).slots.length === 0, `copied ${yCopied}, skipped ${ySkipped.length}`);
  await tid('tt-year-copy-go').click();
  await toast(t('timetable.copy.done')).first().waitFor({ timeout: 15_000 });
  await tid('tt-slot-table').waitFor({ timeout: 15_000 });
  const s2 = await settingsOf(year2.id);
  check('TT-7c the new year has the four slots, the six days and the five lessons now, and the old year is byte for byte what it was', s2.slots.length === 4 && s2.days.join() === '1,2,3,4,5,6' && s2.lessons === 5 && (await sourceSnapshot()) === srcBefore);
  // a closed year: read-only everywhere, still readable and copyable FROM
  must(await rest('POST', `/academic-years/${year.id}/close`, {}), 'close year');
  await goTo('/settings/timetable', heading(t('timetable.settings.title')));
  await tid('tt-year').selectOption(String(year.id));
  await tid('tt-year-closed').waitFor({ timeout: 15_000 });
  check('TT-7d a closed year\'s settings page is read-only: days, add, edit and delete are all off', (await tid('tt-slot-add').isDisabled()) && (await tid('tt-days-save').isDisabled()) && (await tid('tt-day-1').isDisabled()) && (await tid('tt-slot-edit').first().isDisabled()));
  await goTo('/timetable', heading(t('timetable.title')));
  await page.locator('select[id^="picker-year-"]').first().selectOption(String(year.id));
  await page.locator('select[id^="picker-class-"]').first().selectOption({ label: classText('ក') });
  await tid('tt-closed').waitFor({ timeout: 30_000 });
  check('TT-7e a closed year\'s class timetable can be read (its lessons are there) but not changed: a notice, no cell is a button, no copy', (await tid('tt-class-count').count()) === 1 && (await page.locator('.tt-cell-button').count()) === 0 && (await tid('tt-copy-open').isDisabled())
    && (await tid('tt-print').isEnabled()));
  await shot('7-closed-year');
  check('TT-7f the closed year really is read-only in the backend (a cell, a slot and a day are all refused), and its lessons are unchanged', (await rest('PUT', `/timetable/classes/${klass['ក'].id}/cell`, { dayOfWeek: 5, slotId: slotId['ម៉ោង ១'], subjectId: subj.math.id, teacherId: teacher.t1.id })).status === 409
    && (await rest('POST', '/timetable/slots', { yearId: year.id, nameKm: 'ថ្មី', startTime: '12:00', endTime: '12:30', breakSlot: false })).status === 409 && (await rest('PUT', '/timetable/days', { yearId: year.id, days: [1] })).status === 409 && (await sourceSnapshot()) === srcBefore);

  // ---- 8. the history of changes: the user and the time -------------------------------------------------------------------------------------------------
  await goTo('/settings/audit', tid('audit-page'));
  await tid('audit-row').first().waitFor({ timeout: 30_000 });
  for (let i = 0; i < 20 && (await tid('audit-more').count()); i++) { const before = await tid('audit-row').count(); await tid('audit-more').click(); await page.waitForFunction((n) => document.querySelectorAll('[data-testid=audit-row]').length > n, before, { timeout: 15_000 }).catch(() => {}); }
  const auditRows = await tid('audit-row').evaluateAll((rows) => rows.map((r) => ({ action: r.getAttribute('data-action'), cells: [...r.querySelectorAll('td')].map((c) => c.textContent.trim()) })));
  const ttRows = auditRows.filter((r) => r.action?.startsWith('TIMETABLE'));
  const seen = new Set(ttRows.map((r) => r.action));
  check('TT-8a the history of changes lists timetable changes in Khmer, each with the signed-in user and a time (days, slots, lessons, a class copy, a year copy)',
    ['TIMETABLE_DAYS_CHANGED', 'TIMETABLE_SLOT_CREATED', 'TIMETABLE_SLOT_UPDATED', 'TIMETABLE_SLOT_DELETED', 'TIMETABLE_LESSON_SET', 'TIMETABLE_LESSON_CHANGED', 'TIMETABLE_LESSON_CLEARED', 'TIMETABLE_CLASS_COPIED', 'TIMETABLE_YEAR_COPIED'].every((a) => seen.has(a))
    && ttRows.every((r) => r.cells[1].includes('admin.sokha') && /\d/.test(r.cells[0]) && r.cells[2] === t(`audit.action.${r.action}`)), [...seen].join(','));
  await shot('8-history');

  // ---- 9. responsive: 1366x768 and the Full HD laptop at 100 / 125 / 150 % -----------------------------------------------------------------------------
  const workspace = (screenW, screenH, scale) => ({ w: Math.round(screenW / scale), h: Math.round(screenH / scale - 48 - 31) });
  const SCENARIOS = [['fhd-100', workspace(1920, 1080, 1)], ['fhd-125', workspace(1920, 1080, 1.25)], ['fhd-150', workspace(1920, 1080, 1.5)], ['hd-100', workspace(1366, 768, 1)], ['hd-125', workspace(1366, 768, 1.25)], ['hd-150', workspace(1366, 768, 1.5)]];
  const resize = async (w, h) => { await mainWindowCall((win, a) => { win.setMinimumSize(0, 0); win.unmaximize(); win.setContentSize(a.w, a.h); }, { w, h }); await sleep(700); };
  const measure = () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const frame = document.querySelector('.tt-frame');
    return { vw, pageScrollX: document.documentElement.scrollWidth > vw + 1, scrollWidth: document.documentElement.scrollWidth, frame: frame ? { client: frame.clientWidth, scroll: frame.scrollWidth } : null };
  });
  // the year of the lessons is closed now: look at the new year's class (open, six days, with lessons) in the editor, then at the settings page and the student's page
  const results = [];
  for (const [id, size] of SCENARIOS) {
    await resize(size.w, size.h);
    const bad = [];
    for (const href of ['/timetable', '/settings/timetable']) {
      await page.locator(`a[href="${href}"]`).first().click();
      await page.locator('h1, h2').first().waitFor({ timeout: 30_000 });
      if (href === '/timetable') {
        await page.locator('select[id^="picker-year-"]').first().selectOption(String(year2.id));
        await tid('tt-class-count').waitFor({ timeout: 30_000 });
      } else {
        await tid('tt-year').waitFor({ timeout: 30_000 });
      }
      await page.waitForTimeout(500);
      const m = await measure();
      if (m.pageScrollX) bad.push(`${href}: the page scrolls sideways (${m.scrollWidth} of ${m.vw})`);
      if (href === '/timetable') results.push(`${id}: grid ${m.frame ? `${m.frame.scroll} in a frame of ${m.frame.client}` : 'none'}`);
      if (href === '/timetable' && (id === 'hd-150' || id === 'hd-100')) await shot(`9-${id}`);
    }
    check(`TT-9-${id} (${size.w}x${size.h}) the timetable page and its settings page never scroll the page sideways (the grid has its own frame)`, bad.length === 0, bad.join(' | '));
  }
  console.log('      ' + results.join(' | '));
  await resize(1366, 700);

  // ---- 10. nothing stored in the browser, no CSP violation, no console error, local origins only ---------------------------------------------------------------
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
  check('TT-10a the program stores nothing in the browser (localStorage, sessionStorage, cookies are empty)', stored.local === 0 && stored.session === 0 && stored.cookies === '', JSON.stringify(stored));
  const csp = await page.evaluate(() => window.__csp);
  check('TT-10b no CSP violation, no console error, and only app://school and the local backend were contacted', csp.length === 0 && consoleErrors.length === 0 && [...origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)),
    [...csp, ...consoleErrors, ...[...origins].filter((o) => o !== 'app://school' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(o))].slice(0, 3).join(' | '));

  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('TT-11 quitting stops the app and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { const p = app?.windows().find((w) => w.url().startsWith('app://school')); if (p) await p.screenshot({ path: path.join(outDir, 'timetable-e2e-FAIL.png') }); } catch { /* ignore */ }
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
