// The monthly ranking list (ភាពចំណាត់ថ្នាក់ប្រចាំខែ) in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public):
//   1. the list is a PAGE of its own (sidebar entry + a button on the Report cards page): it starts on the standard wording and headings, previews the REAL students of the chosen class
//      (eight made-up ones while a class has nobody), and says how many students still have an incomplete result
//   2. the printed list of one class: every student, in the backend's own rank order (ties share a rank and keep different numbers), the total and the average as the examination results
//      give them, the grade and its colour, the girls and boys marked, an incomplete student last with no rank and a remark; the national header ALWAYS on top
//   3. the three lines of figures under the table (students, passed, failed, each with the girls) equal what the backend's results say
//   4. a class of 45 students runs onto a second A4 page (counted in the real "Save as PDF" output) with the table heading repeated and every student listed once
//   5. "every class of the year": one list per class, a class with nobody is left out and named
//   6. a class with nobody: the page still opens, says there is nothing to print, and Print is off
//   7. the ONE saved default (texts, their font style, the column headings): saved once, kept by the backend, the page starts from it, choosing only a date prints the whole list with the
//      month, the school year and the date filled in; BACK from the preview returns to the page with everything chosen; an emptied box prints nothing
//   8. Khmer digits switched on: no Arabic digit is left on the list
//   9. nothing is stored in the browser, no CSP violation, no console error, only local origins
// A year, five classes (one of them empty and one of 45 students), a teacher, students and scores are seeded through the backend's own REST API (a second login for the test);
// everything that is checked is done through the real UI. All people are invented.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-ranking.mjs
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
const STANDARD = {
  header: '{school}\n{class}',
  title: 'ភាពចំណាត់ថ្នាក់ប្រចាំខែ{month} ({schoolYear})',
  stats: 'បញ្ចប់បញ្ជីត្រឹមចំនួនសិស្សសរុប {total} នាក់ ស្រី {female} នាក់\nសិស្សមានមធ្យមភាគសរុប {passed} នាក់ ស្រី {passedFemale} នាក់\nសិស្សធ្លាក់មធ្យមភាគសរុប {failed} នាក់ ស្រី {failedFemale} នាក់',
  dateLines: '{date}',
  titleRight: 'គ្រូប្រចាំថ្នាក់',
  titleLeft: 'បានឃើញ និងឯកភាព\nនាយក/នាយិកា',
};
const KEYS = Object.keys(STANDARD);
const COLUMN_KEYS = ['no', 'name', 'gender', 'total', 'average', 'rank', 'grade', 'remarks', 'female', 'male'];
const STANDARD_COLUMNS = { no: 'ល.រ', name: 'គោត្តនាម និងនាមខ្លួន', gender: 'ភេទ', total: 'ពិន្ទុសរុប', average: 'មធ្យមភាគ', rank: 'ចំណាត់ថ្នាក់', grade: 'និទ្ទេស', remarks: 'ផ្សេងៗ', female: 'ស', male: 'ប' };
const BAND_BG = { A: 'rgb(226, 239, 218)', B: 'rgb(221, 235, 247)', C: 'rgb(255, 242, 204)', D: 'rgb(252, 228, 214)', E: 'rgb(248, 215, 211)', F: 'rgb(244, 185, 185)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const DIRECTOR = 'លោក នាយក គំរូ';
const TEACHER = 'លោកស្រី គ្រូ គំរូ';
const EXAM = 'ប្រឡងប្រចាំខែតុលា';
const YEAR = 'ឆ្នាំសាកល្បង';
const data = mkdtempSync(path.join(tmpdir(), 'sms ទិន្នន័យ '));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;

// class ក: percent of each student; two students tie on rank 5 and one more student has an incomplete result (a mark missing in the last subject); every grade A to F is present
const PERCENTS = [95, 90, 85, 80, 75, 75, 70, 65, 60, 55, 50, 45];
const NAMES_A = ['ជា សុខា', 'ហេង ដារា', 'ម៉ម វិចិត្រ', 'លី ស្រីមុំ', 'កែវ បូរី', 'ភឹម ចន្ថា', 'ទេព រតនា', 'ឈួន ធីតា', 'វ៉ាន់ សុវណ្ណ', 'គឹម ម៉ាលី', 'ម៉ៅ សោភ័ណ', 'ស៊ុន សុវណ្ណារី'];
const INCOMPLETE = 'ចាន់ មិនទាន់គ្រប់';
const FAMILY_D = ['ស៊ុំ', 'ឡុង', 'ប៊ុន', 'ឈាង', 'នួន', 'ផាន', 'រស់', 'សាយ', 'ធី'];
const GIVEN_D = ['សុខា', 'ដារា', 'ស្រីមុំ', 'បូរី', 'ចន្ថា'];
const STUDENTS = {
  A: [...NAMES_A.map((name, i) => ({ name, gender: i % 2 === 0 ? 'FEMALE' : 'MALE', percent: PERCENTS[i] })), { name: INCOMPLETE, gender: 'FEMALE', percent: 99 }],
  B: [{ name: 'អ៊ុក ពិសី', gender: 'FEMALE', percent: 88 }, { name: 'សៀង ដាលីន', gender: 'MALE', percent: 66 }],
  C: [{ name: 'ស៊ុន តែម្នាក់ឯង', gender: 'MALE', percent: null }],
  D: Array.from({ length: 45 }, (_, i) => ({ name: `${FAMILY_D[i % 9]} ${GIVEN_D[Math.floor(i / 9)]}`, gender: i % 3 === 0 ? 'FEMALE' : 'MALE', percent: 98 - 2 * i })),
  E: [],
};
const genderOf = new Map(Object.values(STUDENTS).flat().map((s) => [s.name, s.gender]));
const two = (n) => String(n).padStart(2, '0');
const round2 = (n) => Math.round(n * 100) / 100;

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
    await page.screenshot({ path: path.join(outDir, `ranking-e2e-${name}.png`) });
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

  // ---- seed: a teacher, the director's name, a year with five classes, one examination, scores -------------------------------------------------
  let apiToken = null;
  const rest = (method, apiPath, body) => page.evaluate(async ({ method, apiPath, body, token }) => {
    const info = await window.desktop.getInfo();
    const res = await fetch(`${info.backendBaseUrl}/api/v1${apiPath}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }, { method, apiPath, body, token: apiToken });
  const must = (res, what) => { if (res.status >= 300) throw new Error(`seeding ${what} failed: ${res.status} ${JSON.stringify(res.json).slice(0, 200)}`); return res.json; };
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
  apiToken = must(await rest('POST', '/auth/login', { username: 'admin.sokha', password: PW }), 'login').token;
  const teacher = must(await rest('POST', '/teachers', { nameKm: TEACHER, gender: 'FEMALE', phone: '000 000 001', address: 'ភូមិថ្មី', specialization: 'ភាសាខ្មែរ', employmentDate: '2020-01-01' }), 'teacher');
  const year = must(await rest('POST', '/academic-years', { nameKm: YEAR, startDate: dayOffset(-60), endDate: dayOffset(200), makeCurrent: true }), 'year');
  const grade = must(await rest('GET', '/grades'), 'grades')[0];
  const gradeId = grade.id;
  const makeClass = async (nameKm, homeroomTeacherId) => must(await rest('POST', '/classes', { academicYearId: year.id, gradeId, nameKm, capacity: null, homeroomTeacherId, shift: null }), `class ${nameKm}`).schoolClass.id;
  const classId = { A: await makeClass('ក', teacher.id), B: await makeClass('ខ', null), C: await makeClass('គ', null), D: await makeClass('ឃ', null), E: await makeClass('ង', null) };
  const addStudent = async (cls, s) => must(await rest('POST', '/students', { nameKm: s.name, gender: s.gender, dateOfBirth: '2019-01-01', enrollmentDate: null, classId: classId[cls], allowDuplicate: false, guardians: [] }), `student ${s.name}`);
  for (const cls of Object.keys(STUDENTS)) for (const s of STUDENTS[cls]) await addStudent(cls, s);
  const exam = must(await rest('POST', '/examinations', { academicYearId: year.id, nameKm: EXAM, kind: 'MONTHLY', termNo: 10, startDate: null, endDate: null }), 'examination');
  const examSubjects = must(await rest('GET', `/examinations/${exam.id}/subjects`), 'subjects').filter((s) => s.gradeId === gradeId);
  const score = async (cls) => {
    const percentOf = new Map(STUDENTS[cls].map((s) => [s.name, s.percent]));
    const roster = must(await rest('GET', `/classes/${classId[cls]}/students`), 'roster');
    for (const [s, subject] of examSubjects.entries()) {
      const scores = roster.flatMap((r) => {
        const percent = percentOf.get(r.nameKm) ?? null;
        // the incomplete student is left without a mark in the LAST subject; a student with no percent has no marks at all
        if (percent === null || (r.nameKm === INCOMPLETE && s === examSubjects.length - 1)) return [];
        return [{ enrollmentId: r.enrollmentId, score: (percent * subject.maxScore) / 100, absent: false, remark: null }];
      });
      if (scores.length > 0) must(await rest('PUT', `/examinations/${exam.id}/scores`, { classId: classId[cls], subjectId: subject.subjectId, scores }), 'scores');
    }
  };
  for (const cls of ['A', 'B', 'D']) await score(cls);
  // the backend's own results are what the printed list must agree with
  const results = async (cls) => must(await rest('GET', `/examinations/${exam.id}/results?classId=${classId[cls]}`), 'results').students;
  const isRanked = (s) => s.complete && s.rank !== null;
  const expectedList = (students) => {
    const byName = (a, b) => a.nameKm.localeCompare(b.nameKm, 'und');
    return [...students.filter(isRanked).sort((a, b) => a.rank - b.rank || byName(a, b)), ...students.filter((s) => !isRanked(s)).sort(byName)];
  };
  const expectedA = expectedList(await results('A'));
  check('RK-0a the seeded class ក: 12 students are ranked (1,2,3,4,5,5,7,8,9,10,11,12) and the 13th, with a missing mark, has no rank',
    expectedA.filter(isRanked).map((r) => r.rank).join(',') === '1,2,3,4,5,5,7,8,9,10,11,12' && !isRanked(expectedA.at(-1)) && expectedA.at(-1).nameKm === INCOMPLETE, expectedA.map((r) => r.rank).join(','));
  const settings0 = (await rest('GET', '/settings/app')).json;
  check('RK-0b the backend ships exactly the standard wording of the six texts and no format or heading is saved yet',
    KEYS.every((k) => settings0[`ranking.${k}`] === STANDARD[k]) && (settings0['ranking.formats'] ?? '') === '' && (settings0['ranking.columns'] ?? '') === '' && settings0['ranking.allClasses'] === 'false',
    KEYS.filter((k) => settings0[`ranking.${k}`] !== STANDARD[k]).join(','));

  await goTo('/settings/school', heading(t('settings.school.title')));
  await field('directorName').fill(DIRECTOR);
  await button(t('common.save')).click();
  await page.locator('.toast', { hasText: t('settings.school.saved') }).first().waitFor({ timeout: 15_000 });

  // ---- helpers for the screens ---------------------------------------------------------------------------------------------------------------
  const openCards = async () => {
    await goTo('/report-cards', page.locator('#card-exam'));
    await page.locator('#card-exam').selectOption({ label: EXAM });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=cards-table] tbody tr[data-student]').length > 0, null, { timeout: 20_000 });
  };
  const pageReady = () => page.waitForFunction(() => { const open = document.querySelector('[data-testid=ranking-open]'); return !!open && !open.disabled; }, null, { timeout: 20_000 });
  const previewRows = () => page.locator('[data-testid=ranking-preview] [data-testid=ranking-row]').count();
  /** Chooses a class of the picker ("<grade> <class>": the class is the last word) and waits for the preview to show `rows` students. */
  const pickClass = async (name, rows) => {
    const select = page.locator('select[id^="picker-class-"]');
    const value = await select.evaluate((el, n) => [...el.options].find((o) => o.textContent.trim().endsWith(` ${n}`))?.value ?? null, name);
    if (value === null) throw new Error(`no class "${name}" in the picker`);
    await select.selectOption(value);
    if (rows !== undefined) await page.waitForFunction((n) => document.querySelectorAll('[data-testid=ranking-preview] [data-testid=ranking-row]').length === n, rows, { timeout: 20_000 });
  };
  /** From the Report cards page (examination and class chosen) to the ranking page. */
  const openRankingPage = async () => {
    await page.locator('[data-testid=monthly-ranking]').click();
    await page.locator('[data-testid=ranking-form]').waitFor({ timeout: 15_000 });
    await pageReady();
  };
  const printLoaded = async () => {
    await page.waitForFunction(() => document.querySelector('[data-loaded="1"]'), null, { timeout: 60_000 });
    await page.waitForTimeout(1200);   // the Khmer font arrives and the lines settle
  };
  /** On the ranking page: starts from the standard look (so every run is the same), applies the choices and opens the print page. */
  const makeRanking = async ({ texts = {}, columns = {}, date = isoLocal(new Date()), all = false, colours = true } = {}) => {
    await page.locator('[data-testid=ranking-def-reset]').click();
    for (const [k, value] of Object.entries(texts)) await page.locator(`#ranking-text-${k}`).fill(value);
    for (const [k, value] of Object.entries(columns)) await page.locator(`#ranking-column-${k}`).fill(value);
    await page.locator('#ranking-date').fill(date);
    if ((await page.locator('#ranking-all').isChecked()) !== all) await page.locator('#ranking-all').click();
    if ((await page.locator('#ranking-colours').isChecked()) !== colours) await page.locator('#ranking-colours').click();
    await page.locator('[data-testid=ranking-open]').click();
    await printLoaded();
  };
  /** Back from the print page: it returns to the ranking page. */
  const back = async () => {
    await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
    await page.locator('[data-testid=ranking-form]').waitFor({ timeout: 20_000 });
    await pageReady();
  };
  const sheetCount = () => page.locator('.ranking-sheet').count();
  /** What the printed lists look like: rows, the room they take, and whether anything leaves its place. */
  const measure = () => page.evaluate(() => [...document.querySelectorAll('.ranking-sheet')].map((sheet) => {
    const text = (id) => sheet.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
    const st = (id) => { const el = sheet.querySelector(`[data-testid=${id}]`); if (!el) return null; const cs = getComputedStyle(el); return { weight: Number(cs.fontWeight), size: parseFloat(cs.fontSize), align: cs.textAlign, style: cs.fontStyle, decoration: cs.textDecorationLine, whiteSpace: cs.whiteSpace, fits: el.scrollWidth <= el.clientWidth + 1 }; };
    const rows = [...sheet.querySelectorAll('[data-testid=ranking-row]')].map((tr) => ({
      no: tr.dataset.no, rank: tr.dataset.rank, h: Math.round(tr.getBoundingClientRect().height), band: [...tr.classList].find((c) => c.startsWith('ranking-band-')) ?? '', bg: getComputedStyle(tr.children[0]).backgroundColor, remarksBg: getComputedStyle(tr.children[8]).backgroundColor,
      cells: [...tr.children].map((c) => c.textContent.trim()),
    }));
    const box = (sel) => sheet.querySelector(sel)?.getBoundingClientRect();
    const n = box('[data-testid=ranking-national]'), d = box('.ranking-divider svg'), s = box('.ranking-school'), ti = box('.ranking-title'), tb = box('.ranking-table'), sr = sheet.getBoundingClientRect();
    return {
      cls: sheet.dataset.class, rows, headBg: getComputedStyle(sheet.querySelector('thead th')).backgroundColor, headH: Math.round(sheet.querySelector('thead tr').getBoundingClientRect().height), heads: [...sheet.querySelectorAll('thead th')].map((th) => th.textContent.trim()), theadDisplay: getComputedStyle(sheet.querySelector('thead')).display,
      national: sheet.querySelectorAll('[data-testid=ranking-national] p').length, nationalText: [...sheet.querySelectorAll('[data-testid=ranking-national] p')].map((p) => p.textContent.trim()),
      // the order down the page: national header, the flourish, the school block, the title, then the table; the header starts inside the sheet
      headOrder: !!(n && d && ti && tb) && n.top >= sr.top && n.bottom <= d.top + 1 && d.bottom <= (s ? s.top : ti.top) + 1 && (!s || s.bottom <= ti.top + 1) && ti.bottom <= tb.top + 1,
      header: text('ranking-header'), title: text('ranking-title'), stats: text('ranking-stats'), date: text('ranking-date'), titleLeft: text('ranking-title-left'), titleRight: text('ranking-title-right'),
      director: text('ranking-director'), teacher: text('ranking-teacher'),
      fmt: { title: st('ranking-title'), stats: st('ranking-stats'), date: st('ranking-date'), header: st('ranking-header'), titleLeft: st('ranking-title-left'), titleRight: st('ranking-title-right') },
      statsCount: sheet.querySelectorAll('[data-testid=ranking-stats]').length, footCount: sheet.querySelectorAll('.ranking-foot').length,
    };
  }));
  /** Clicks the real "Save as PDF" button (the save dialog answers with a file) and counts the pages of what the shell wrote; `keep` names a copy to look at. */
  let pdfNo = 0;
  const pdfPages = async (keep = null) => {
    const file = path.join(outDir, `ranking-e2e-${keep ?? ++pdfNo}.pdf`);
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('print.savePdf')).click();
    for (let i = 0; i < 60 && !existsSync(file); i++) await sleep(250);
    await sleep(300);
    const pdf = existsSync(file) ? readFileSync(file).toString('latin1') : '';
    if (keep === null) rmSync(file, { force: true });
    return pdf.startsWith('%PDF-') ? (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length : -1;
  };
  /** The figures the three lines under the table must show for a list, worked out from the backend's results and the seeded genders. */
  const expectedStats = (list) => {
    const girls = (l) => l.filter((s) => genderOf.get(s.nameKm) === 'FEMALE').length;
    const passed = list.filter((s) => isRanked(s) && s.passed === true);
    const failed = list.filter((s) => isRanked(s) && s.passed === false);
    return { total: list.length, female: girls(list), passed: passed.length, passedFemale: girls(passed), failed: failed.length, failedFemale: girls(failed) };
  };
  const statsText = (template, s) => template.replace(/\{(\w+)\}/g, (m, k) => (k in s ? two(s[k]) : m));
  await mainWindowCall((win) => { win.unmaximize(); win.setContentSize(1366, 1400); });   // tall enough to see a whole sheet in a picture
  const gradeName = grade.nameKm;

  // ---- 1. the page --------------------------------------------------------------------------------------------------------------------------------
  const sidebar = await page.locator('a[href="/monthly-ranking"]').count();
  await openCards();
  const linkOnCards = await page.locator('[data-testid=monthly-ranking]').count();
  check('RK-1a the ranking list has a sidebar entry and a button on the Report cards page', sidebar >= 1 && linkOnCards === 1, JSON.stringify({ sidebar, linkOnCards }));
  await openRankingPage();
  const boxes = await Promise.all(KEYS.map((k) => page.locator(`#ranking-text-${k}`).inputValue()));
  const heads0 = await Promise.all(COLUMN_KEYS.map((k) => page.locator(`#ranking-column-${k}`).inputValue()));
  check('RK-1b the page is a page of its own (not a window) and starts on the standard wording: six boxes, thirteen words to click, a font toolbar on every box, ten column headings, and "Save as the default" is off',
    page.url().includes('/monthly-ranking') && boxes.join('|') === KEYS.map((k) => STANDARD[k]).join('|') && (await page.locator('.honor-token').count()) === 13 && (await page.locator('[data-fmt$="-bold"]').count()) === 6
    && (await page.locator('[data-fmt$="-size"]').count()) === 6 && heads0.join('|') === COLUMN_KEYS.map((k) => STANDARD_COLUMNS[k]).join('|') && (await page.locator('[data-testid=ranking-def-save]').isDisabled()), page.url());
  // (the page is "ready" as soon as the open button works; the preview's own answer may still be on its way: wait for it, as pickClass does, instead of counting at once. A full chain run once failed here, a rerun alone passed 51 / 51)
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=ranking-preview] [data-testid=ranking-row]').length === 13, null, { timeout: 20_000 }).catch(() => { /* the check below reports what is really there */ });
  check('RK-1c the preview shows the 13 REAL students of the chosen class ក (the sample says so) and warns that one student has an incomplete result',
    (await previewRows()) === 13 && (await page.locator('.text-muted.small', { hasText: t('ranking.defaults.previewReal') }).count()) === 1
    && (await page.locator('[data-testid=ranking-waiting]').innerText()).trim() === t('ranking.waiting').replace('{count}', '1'));
  await shot('01-ranking-page');
  await pickClass('ខ', 2);
  check('RK-1d choosing class ខ shows its 2 students and no warning (every result is complete)', (await previewRows()) === 2 && (await page.locator('[data-testid=ranking-waiting]').count()) === 0);
  await pickClass('ង', 8);
  check('RK-1e a class with nobody shows eight made-up students instead, and says they are not real', (await previewRows()) === 8 && (await page.locator('.text-muted.small', { hasText: t('ranking.defaults.previewSample') }).count()) === 1);
  const sampleBands = await page.evaluate(() => [...document.querySelectorAll('[data-testid=ranking-preview] [data-testid=ranking-row]')].map((tr) => [...tr.classList].find((c) => c.startsWith('ranking-band-'))?.slice(-1)).join(''));
  check('RK-1f the sample shows every grade colour A to F', ['A', 'B', 'C', 'D', 'E', 'F'].every((l) => sampleBands.includes(l)), sampleBands);
  await pickClass('ក', 13);

  // ---- 2 + 3. the printed list of class ក, on the standard wording -------------------------------------------------------------------------------------
  await makeRanking({ date: '2026-11-05' });
  const a = (await measure())[0];
  const rowsOk = a.rows.length === expectedA.length && a.rows.every((r, i) => {
    const e = expectedA[i];
    const ranked = isRanked(e);
    return r.cells[1] === e.nameKm && r.no === String(i + 1) && r.cells[0] === String(i + 1) && r.rank === (ranked ? String(e.rank) : '') && r.cells[5] === (ranked ? String(e.rank) : '')
      && r.cells[2] === (genderOf.get(e.nameKm) === 'FEMALE' ? STANDARD_COLUMNS.female : STANDARD_COLUMNS.male)
      && (ranked ? Number(r.cells[3]) === round2(e.total) && Number(r.cells[4]) === round2(e.percent / 10) && r.cells[6] === e.bandLabel && r.cells[7] === e.bandLetter && r.remarksBg === BAND_BG.A
        : r.cells[3] === '' && r.cells[4] === '' && r.cells[5] === '' && r.cells[6] === '' && r.cells[7] === '' && r.cells[8] === t('ranking.incomplete'));
  });
  check('RK-2a the list has all 13 students of the class in the backend\'s own order: numbered 1 to 13, ranks 1,2,3,4,5,5,7,...,12, the total and the average (percentage / 10) as the examination results give them, the grade, the girls and boys marked',
    rowsOk, JSON.stringify(a.rows.slice(0, 2)));
  const tied = a.rows.filter((r) => r.rank === '5');
  check('RK-2b the two students tied on rank 5 share the rank and keep different numbers (5 and 6); rank 6 does not exist and the next rank is 7', tied.length === 2 && tied[0].no === '5' && tied[1].no === '6' && a.rows[6].rank === '7' && !a.rows.some((r) => r.rank === '6'));
  const last = a.rows.at(-1);
  check('RK-2c the student with a missing mark is LAST, with no total, no average, no rank and no grade, and the remark "ពិន្ទុមិនទាន់គ្រប់" in the remarks column',
    last.cells[1] === INCOMPLETE && last.no === '13' && last.cells.slice(3, 8).every((c) => c === '') && last.cells[8] === t('ranking.incomplete') && last.band === '');
  const colourOk = a.rows.filter((r) => r.band !== '').every((r) => r.bg === BAND_BG[r.band.slice(-1)] && r.band.slice(-1) === r.cells[7]);
  check('RK-2d every row takes the colour of its grade (A green, B blue, C yellow, D orange, E and F red) and all six grades are on this list', colourOk && new Set(a.rows.map((r) => r.cells[7]).filter(Boolean)).size === 6, [...new Set(a.rows.map((r) => r.cells[7]))].join(''));
  check('RK-2e the column headings are the standard ones of the school\'s sample (the grade spans two cells)', a.heads.join('|') === ['no', 'name', 'gender', 'total', 'average', 'rank', 'grade', 'remarks'].map((k) => STANDARD_COLUMNS[k]).join('|'), a.heads.join('|'));
  check('RK-2f the national header is on top with its flourish, in order (national header, flourish, school and class, title, table), although the "national header" switch of the printed reports is off',
    a.national === 2 && a.nationalText[0] === 'ព្រះរាជាណាចក្រកម្ពុជា' && a.nationalText[1] === 'ជាតិ សាសនា ព្រះមហាក្សត្រ' && a.headOrder, JSON.stringify(a.nationalText));
  check('RK-2g every text is filled in for this class and date: the school and class (left), the title with the month and the school year, the date, both signature titles, and the director\'s and the teacher\'s names',
    a.header === `${SCHOOL}\n${gradeName} ក` && a.title === `ភាពចំណាត់ថ្នាក់ប្រចាំខែវិច្ឆិកា (${YEAR})` && a.date === 'ថ្ងៃទី5 ខែវិច្ឆិកា ឆ្នាំ2026' && a.titleRight === 'គ្រូប្រចាំថ្នាក់' && a.titleLeft === 'បានឃើញ និងឯកភាព\nនាយក/នាយិកា'
    && a.director === DIRECTOR && a.teacher === TEACHER, JSON.stringify({ h: a.header, t: a.title, d: a.date }));
  const statsA = expectedStats(expectedA);
  check('RK-2h the three lines of figures equal the backend\'s: 13 students (7 girls), 11 passed, 1 failed, each with its girls, in two digits; the 13th student is neither passed nor failed',
    a.stats === statsText(STANDARD.stats, statsA) && statsA.total === 13 && statsA.passed + statsA.failed === 12, JSON.stringify({ shown: a.stats, expected: statsA }));
  check('RK-2i the figures and the date stay on one line each (nothing wraps or leaves its place), and the real "Save as PDF" is exactly one A4 page',
    a.fmt.stats.fits && a.fmt.date.fits && a.fmt.stats.whiteSpace === 'pre' && (await pdfPages('class-a')) === 1);
  // no cell wraps onto a second line (a narrow column makes some rows taller than the rest): every row and the heading have the height of one line
  const heights = a.rows.map((r) => r.h);
  check('RK-2j no cell wraps: the 13 rows are all one line high (the tallest is at most 1.15 times the shortest) and so is the table heading, the grade names and the remark included',
    Math.max(...heights) <= Math.min(...heights) * 1.15 && a.headH <= Math.min(...heights) * 1.15, JSON.stringify({ min: Math.min(...heights), max: Math.max(...heights), head: a.headH }));
  // a toast (here the "saved as PDF" one that has just appeared) must never be printed on the document
  await page.locator('.toast.show').first().waitFor({ timeout: 10_000 });
  const toastsOnScreen = await page.locator('.toast.show').count();
  await page.emulateMedia({ media: 'print' });
  // what has a box counts (a hidden container leaves its children without one, while their own display stays as it was)
  const toastsInPrint = await page.evaluate(() => [...document.querySelectorAll('.toast-container, .toast')].filter((el) => el.getClientRects().length > 0).length);
  await page.emulateMedia({ media: null });
  check('RK-2k a notification on screen ("saved as PDF") is not shown in print media, so it can never be printed on the list', toastsOnScreen >= 1 && toastsInPrint === 0, JSON.stringify({ toastsOnScreen, toastsInPrint }));
  await shot('02-printed-class-a');

  // ---- 4. a class of 45 students: a second page with the heading repeated -------------------------------------------------------------------------------
  await back();
  await pickClass('ឃ', 45);
  await makeRanking({ date: '2026-11-05' });
  const d = (await measure())[0];
  const expectedD = expectedList(await results('D'));
  check('RK-3a all 45 students of the big class are listed once, in rank order 1 to 45, numbered 1 to 45, and the foot (figures, date, signatures) is there once',
    d.rows.length === 45 && d.rows.every((r, i) => r.cells[1] === expectedD[i].nameKm && r.rank === String(i + 1) && r.no === String(i + 1)) && new Set(d.rows.map((r) => r.cells[1])).size === 45 && d.footCount === 1 && d.statsCount === 1);
  const statsD = expectedStats(expectedD);
  check('RK-3b the figures of the big class are the backend\'s (45 students, 15 girls)', d.stats === statsText(STANDARD.stats, statsD) && statsD.total === 45 && statsD.female === 15, d.stats);
  const dPages = await pdfPages('class-d');
  check('RK-3c the real PDF of 45 students is two A4 pages, and the table heading is set to repeat on each page', dPages === 2 && d.theadDisplay === 'table-header-group', JSON.stringify({ dPages, thead: d.theadDisplay }));
  await shot('03-printed-class-d');

  // ---- 5. every class of the year ------------------------------------------------------------------------------------------------------------------
  await back();
  await pickClass('ក', 13);
  await makeRanking({ date: '2026-11-05', all: true });
  const all = await measure();
  const skippedText = await page.locator('[data-testid=ranking-skipped]').innerText();
  check('RK-4a "every class" makes one list for each class that has students (ក, ខ, គ, ឃ), in class order, and names the class with nobody (ង) as left out',
    all.length === 4 && all.map((x) => x.cls).join(',') === ['A', 'B', 'C', 'D'].map((c) => classId[c]).join(',') && skippedText.includes(`${gradeName} ង`) && all.every((x) => x.national === 2 && x.headOrder), `${all.length} sheets; ${skippedText}`);
  check('RK-4b each list has its own class, students and teacher: ក 13 with the teacher, ខ 2, គ 1 (the one student has no marks: last, with the remark), ឃ 45',
    all.map((x) => x.rows.length).join(',') === '13,2,1,45' && all[0].teacher === TEACHER && all[1].teacher === '' && all[2].rows[0].cells[8] === t('ranking.incomplete') && all[1].header === `${SCHOOL}\n${gradeName} ខ`);
  check('RK-4d the note at the top of the print page counts the students with an incomplete result in the lists printed (class ក 1, class គ 1 = 2)',
    (await page.locator('[data-testid=ranking-waiting]').innerText()).trim() === t('ranking.waiting').replace('{count}', '2'));
  const allPages = await pdfPages('all');
  check('RK-4c the real PDF of every class is 5 A4 pages (1 + 1 + 1 + 2): each list starts on its own page', allPages === 5, String(allPages));
  await back();

  // ---- 6. a class with nobody ----------------------------------------------------------------------------------------------------------------------
  await pickClass('ង', 8);
  await makeRanking({ date: '2026-11-05' });
  check('RK-5 a class with nobody opens the print page, which says there is nothing to print: no list, Print is off',
    (await page.locator('[data-testid=ranking-none]').isVisible()) && (await sheetCount()) === 0 && (await button(t('print.print')).isDisabled()));
  await back();
  await pickClass('ក', 13);

  // ---- 6b. the table colours: coloured (as before) or transparent ---------------------------------------------------------------------------------------
  await page.locator('[data-testid=ranking-def-reset]').click();
  check('RK-5b the page has the option "colour the table", ticked by default (the table is coloured as before), and nothing differs from the saved default',
    (await page.locator('#ranking-colours').isChecked()) === true && (await page.locator('[data-testid=ranking-def-save]').isDisabled()));
  await page.locator('#ranking-colours').uncheck();
  const previewBg = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid=ranking-preview] .ranking-sheet');
    const bg = (el) => getComputedStyle(el).backgroundColor;
    const rows = [...sheet.querySelectorAll('[data-testid=ranking-row]')];
    return { plain: sheet.classList.contains('ranking-plain'), head: bg(sheet.querySelector('thead th')), rows: rows.map((tr) => bg(tr.children[0])), remarks: rows.map((tr) => bg(tr.children[8])) };
  });
  const NONE = 'rgba(0, 0, 0, 0)';
  check('RK-5c unticking it makes the preview table transparent at once: the heading, every row and the remarks column have no background, and the page offers to save the choice',
    previewBg.plain && previewBg.head === NONE && previewBg.rows.length === 13 && previewBg.rows.every((c) => c === NONE) && previewBg.remarks.every((c) => c === NONE) && (await page.locator('[data-testid=ranking-differs]').count()) === 1, JSON.stringify(previewBg));
  await page.locator('[data-testid=ranking-open]').click();
  await printLoaded();
  const plainSheet = (await measure())[0];
  const plainHeights = plainSheet.rows.map((r) => r.h);
  check('RK-5d the printed list without colours has a transparent heading, rows and remarks column, still prints each grade as its name and letter, keeps the national header, the figures and one line per row, and is one A4 page in the real PDF',
    plainSheet.headBg === NONE && plainSheet.rows.every((r) => r.bg === NONE && r.remarksBg === NONE) && plainSheet.rows.slice(0, 12).every((r, i) => r.cells[7] === expectedA[i].bandLetter && r.cells[6] === expectedA[i].bandLabel)
    && plainSheet.stats === statsText(STANDARD.stats, statsA) && plainSheet.national === 2 && plainSheet.headOrder && Math.max(...plainHeights) <= Math.min(...plainHeights) * 1.15 && (await pdfPages('plain')) === 1, JSON.stringify({ head: plainSheet.headBg, row: plainSheet.rows[0].bg }));
  await shot('02b-printed-without-colours');
  await back();
  check('RK-5e Back from the plain list returns to the page with the colours still off', (await page.locator('#ranking-colours').isChecked()) === false);
  await page.locator('#ranking-colours').check();
  await page.locator('[data-testid=ranking-open]').click();
  await printLoaded();
  const colouredAgain = (await measure())[0];
  check('RK-5f ticking it again prints the coloured table again: the heading yellow, the rows by grade (A green ... F red)',
    colouredAgain.headBg === 'rgb(255, 217, 102)' && colouredAgain.rows[0].bg === BAND_BG.A && colouredAgain.rows[11].bg === BAND_BG.F, JSON.stringify({ head: colouredAgain.headBg, first: colouredAgain.rows[0].bg }));
  await back();

  // ---- 7. the ONE saved default: texts, their font style and the column headings -----------------------------------------------------------------------------
  await page.locator('[data-testid=ranking-def-reset]').click();
  const box = (k) => page.locator(`#ranking-text-${k}`);
  const SAVED = {
    header: 'កម្រងសាលាលេខ២\n{school}\n{class}', title: 'ចំណាត់ថ្នាក់ខែ{month} {schoolYear}', stats: 'សរុប {total} នាក់ (ស្រី {female})\nជាប់ {passed} នាក់ ធ្លាក់ {failed} នាក់',
    dateLines: 'ភ្នំពេញ ថ្ងៃសុក្រ  ២រោច\n{date}', titleRight: 'គ្រូបន្ទុកថ្នាក់', titleLeft: 'នាយកសាលា',
  };
  const SAVED_COLUMNS = { rank: 'លំដាប់', grade: 'ថ្នាក់', female: 'ស្រី', male: 'ប្រុស', remarks: '' };
  await box('header').fill(SAVED.header);
  await box('title').fill('ចំណាត់ថ្នាក់ខែ{month} ');
  await page.locator('.honor-token[data-token=schoolYear]').click();   // a click puts the word where the cursor was
  check('RK-6a clicking a word ({schoolYear}) inserts it at the cursor of the box that was being typed in', (await box('title').inputValue()) === SAVED.title, await box('title').inputValue());
  await box('stats').fill(SAVED.stats);
  await box('dateLines').fill(SAVED.dateLines);
  await box('titleRight').fill(SAVED.titleRight);
  await box('titleLeft').fill(SAVED.titleLeft);
  for (const [k, value] of Object.entries(SAVED_COLUMNS)) await page.locator(`#ranking-column-${k}`).fill(value);
  await page.locator('#ranking-colours').uncheck();   // the colours are part of the saved default too
  // the font toolbar: the title extra large and italic, the figures bold, the date lines small
  await page.selectOption('[data-fmt="title-size"]', 'XL');
  await page.locator('[data-fmt="title-italic"]').click();
  await page.locator('[data-fmt="stats-bold"]').click();
  await page.selectOption('[data-fmt="dateLines-size"]', 'S');
  const pv = await page.evaluate(() => {
    const s = document.querySelector('[data-testid=ranking-preview] .ranking-sheet');
    const text = (id) => s.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
    const f = (id) => { const cs = getComputedStyle(s.querySelector(`[data-testid=${id}]`)); return { weight: Number(cs.fontWeight), size: parseFloat(cs.fontSize), style: cs.fontStyle }; };
    const fmtOf = () => ({ title: f('ranking-title'), stats: f('ranking-stats'), date: f('ranking-date'), header: f('ranking-header'), right: f('ranking-title-right') });
    return { rows: s.querySelectorAll('[data-testid=ranking-row]').length, header: text('ranking-header'), title: text('ranking-title'), stats: text('ranking-stats'), heads: [...s.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
      sex: [...s.querySelectorAll('[data-testid=ranking-row]')].slice(0, 2).map((tr) => tr.children[2].textContent.trim()), fmt: fmtOf() };
  });
  check('RK-6b the preview follows the form at once: the real class, every box with its words filled in, the typed line breaks kept, the new column headings and the new sex marks',
    pv.rows === 13 && pv.header === `កម្រងសាលាលេខ២\n${SCHOOL}\n${gradeName} ក` && pv.title.startsWith('ចំណាត់ថ្នាក់ខែ') && pv.title.endsWith(` ${YEAR}`) && !pv.title.includes('{')
    && pv.stats === `សរុប 13 នាក់ (ស្រី 07)\nជាប់ ${two(statsA.passed)} នាក់ ធ្លាក់ ${two(statsA.failed)} នាក់` && pv.heads.includes('លំដាប់') && pv.heads.includes('ថ្នាក់') && !pv.heads.includes(STANDARD_COLUMNS.remarks) && pv.sex.join('|') === 'ស្រី|ប្រុស', JSON.stringify({ t: pv.title, s: pv.stats, h: pv.heads, x: pv.sex }));
  check('RK-6c the toolbar changes how each box prints, in the preview at once: the title italic and larger than the right signature title, the figures bold, the date lines small (0.85 of the school block, which has the same base size)',
    pv.fmt.title.style === 'italic' && pv.fmt.title.size > pv.fmt.right.size * 1.4 && pv.fmt.stats.weight >= 700 && Math.abs(pv.fmt.date.size / pv.fmt.header.size - 0.85) < 0.03, JSON.stringify(pv.fmt));
  await shot('04-ranking-page-set');
  await box('stats').fill('1\n2\n3\n4\n5');
  check('RK-6d a fifth line is refused next to the box and "Save as the default" is off (nothing is cut silently)',
    (await page.locator('.invalid-feedback', { hasText: t('honor.defaults.tooManyLines').replace('{lines}', '4') }).count()) === 1 && (await page.locator('[data-testid=ranking-def-save]').isDisabled()));
  await box('stats').fill(SAVED.stats);
  await page.locator('[data-testid=ranking-def-save]').click();
  await page.locator('.toast.show', { hasText: t('ranking.defaults.saved') }).first().waitFor({ timeout: 15_000 });
  check('RK-6e once saved, nothing differs from the saved default any more', (await page.locator('[data-testid=ranking-differs]').count()) === 0 && (await page.locator('[data-testid=ranking-def-save]').isDisabled()));
  const settings1 = (await rest('GET', '/settings/app')).json;
  const savedFormats = JSON.parse(settings1['ranking.formats']);
  const savedColumns = JSON.parse(settings1['ranking.columns']);
  check('RK-6f the backend holds what was saved: the six texts with their line breaks and spaces, only the formats that differ (title XL italic, stats bold, date lines small), only the headings that differ',
    KEYS.every((k) => settings1[`ranking.${k}`] === SAVED[k]) && savedFormats.title?.size === 'XL' && savedFormats.title?.italic === true && savedFormats.stats?.bold === true && savedFormats.dateLines?.size === 'S'
    && Object.keys(savedFormats).sort().join() === 'dateLines,stats,title' && Object.entries(SAVED_COLUMNS).every(([k, v]) => savedColumns[k] === v) && Object.keys(savedColumns).length === 5 && settings1['ranking.colours'] === 'false', `${settings1['ranking.formats']} ${settings1['ranking.columns']}`);

  // the next time: from the Report cards page the page starts from the saved default, so only the date is left to choose
  await openCards();
  await openRankingPage();
  const winTexts = await Promise.all(KEYS.map((k) => box(k).inputValue()));
  const winHeads = await Promise.all(Object.keys(SAVED_COLUMNS).map((k) => page.locator(`#ranking-column-${k}`).inputValue()));
  check('RK-7a the page now starts from the saved default: all six texts as saved (the words in braces still in them), the toolbars as saved, the column headings and the colours (off) as saved, and today\'s date',
    winTexts.join('|') === KEYS.map((k) => SAVED[k]).join('|') && winHeads.join('|') === Object.values(SAVED_COLUMNS).join('|') && (await page.locator('[data-fmt="title-italic"]').getAttribute('aria-pressed')) === 'true'
    && (await page.locator('[data-fmt="title-size"]').inputValue()) === 'XL' && (await page.locator('[data-fmt="stats-bold"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('#ranking-colours').isChecked()) === false && (await page.locator('#ranking-date').inputValue()) === isoLocal(new Date()), JSON.stringify(winTexts));
  await page.locator('#ranking-date').fill('2026-11-30');   // the ONLY thing changed
  check('RK-7b the page shows the chosen date in words at once', (await page.locator('[data-testid=ranking-date-long]').innerText()).includes('30') && (await page.locator('[data-testid=ranking-date-long]').innerText()).includes('វិច្ឆិកា'));
  await page.locator('[data-testid=ranking-open]').click();
  await printLoaded();
  const s1 = (await measure())[0];
  check('RK-7c changing only the date prints the whole saved list with the month, the school year and the date filled in, the new headings and sex marks, the title italic and large, the figures bold, no colours in the table (as saved), one A4 page',
    s1.header === `កម្រងសាលាលេខ២\n${SCHOOL}\n${gradeName} ក` && s1.title === `ចំណាត់ថ្នាក់ខែវិច្ឆិកា ${YEAR}` && s1.date === 'ភ្នំពេញ ថ្ងៃសុក្រ  ២រោច\nថ្ងៃទី30 ខែវិច្ឆិកា ឆ្នាំ2026' && s1.titleRight === 'គ្រូបន្ទុកថ្នាក់' && s1.titleLeft === 'នាយកសាលា'
    && s1.stats === `សរុប 13 នាក់ (ស្រី 07)\nជាប់ ${two(statsA.passed)} នាក់ ធ្លាក់ ${two(statsA.failed)} នាក់` && s1.heads.includes('លំដាប់') && s1.heads.includes('ថ្នាក់') && s1.rows[0].cells[2] === 'ស្រី' && s1.rows[1].cells[2] === 'ប្រុស' && s1.headBg === NONE && s1.rows.every((r) => r.bg === NONE)
    && s1.fmt.title.style === 'italic' && s1.fmt.title.size > s1.fmt.titleRight.size * 1.4 && s1.fmt.stats.weight >= 700 && s1.national === 2 && s1.headOrder && (await pdfPages()) === 1, JSON.stringify({ t: s1.title, d: s1.date, h: s1.heads }));
  check('RK-7d the spaces and line breaks typed in the boxes are on the paper: the school block keeps its line breaks ("pre-wrap"), the date lines keep the double space and stay on one line each, and the figures stay on one line each',
    s1.fmt.header.whiteSpace === 'pre-wrap' && s1.date.includes('ថ្ងៃសុក្រ  ២រោច') && s1.fmt.date.whiteSpace === 'pre' && s1.fmt.date.fits && s1.fmt.stats.fits);
  await shot('05-printed-from-defaults');

  // THE RETURN: Back from the preview comes back to the ranking page itself, with everything that was chosen
  await back();
  check('RK-7e Back from the preview returns to the ranking page with everything as it was: the same examination and class, the date 30 November, all six texts, the column headings and the toolbar',
    page.url().includes('/monthly-ranking') && (await page.locator('#ranking-exam').evaluate((el) => el.selectedOptions[0]?.textContent.trim())) === EXAM && (await page.locator('select[id^="picker-class-"]').evaluate((el) => el.selectedOptions[0]?.textContent.trim().endsWith(' ក')))
    && (await page.locator('#ranking-date').inputValue()) === '2026-11-30' && (await Promise.all(KEYS.map((k) => box(k).inputValue()))).join('|') === KEYS.map((k) => SAVED[k]).join('|')
    && (await page.locator('#ranking-column-rank').inputValue()) === 'លំដាប់' && (await page.locator('[data-fmt="title-italic"]').getAttribute('aria-pressed')) === 'true', page.url());

  // another date, and nothing else: the month and the date lines follow it by themselves; an emptied box prints nothing
  await page.locator('#ranking-date').fill('2026-12-05');
  await box('stats').fill('');
  await page.locator('[data-testid=ranking-open]').click();
  await printLoaded();
  const s2 = (await measure())[0];
  check('RK-7f choosing another date (5 December) changes the month and the date lines by themselves, and a box emptied for this print (the figures) prints nothing, with the rest of the list unchanged',
    s2.title === `ចំណាត់ថ្នាក់ខែធ្នូ ${YEAR}` && s2.date === 'ភ្នំពេញ ថ្ងៃសុក្រ  ២រោច\nថ្ងៃទី5 ខែធ្នូ ឆ្នាំ2026' && s2.statsCount === 0 && s2.rows.length === 13 && s2.footCount === 1 && (await pdfPages()) === 1, JSON.stringify({ t: s2.title, d: s2.date, n: s2.statsCount }));
  await back();
  check('RK-7g the emptied box was only emptied for that print: the saved default still has its figures', (await rest('GET', '/settings/app')).json['ranking.stats'] === SAVED.stats);

  // a long line of figures with "keep each line on one line" shrinks to its place instead of wrapping
  const longStats = 'សរុបសិស្សទាំងអស់ក្នុងថ្នាក់នេះ {total} នាក់ ស្រី {female} នាក់ ជាប់ {passed} នាក់ ធ្លាក់ {failed} នាក់';
  await box('stats').fill(longStats);
  await page.locator('[data-testid=ranking-open]').click();
  await printLoaded();
  const s3 = (await measure())[0];
  const shrunk = await page.locator('[data-testid=ranking-stats]').first().evaluate((el) => Number(el.style.getPropertyValue('--fit') || 1));
  check('RK-7h a very long line of figures is kept on one line and shrunk to its place (nothing leaves it), and the list is still one A4 page', s3.fmt.stats.fits && shrunk < 1 && s3.stats.split('\n').length === 1 && (await pdfPages()) === 1, `--fit ${shrunk}`);
  await back();
  // back to the standard look for the rest
  await page.locator('[data-testid=ranking-def-reset]').click();
  await page.locator('[data-testid=ranking-def-save]').click();
  await page.locator('.toast.show', { hasText: t('ranking.defaults.saved') }).first().waitFor({ timeout: 15_000 });
  const settings2 = (await rest('GET', '/settings/app')).json;
  check('RK-7i "Back to the standard" and "Save as the default" return the saved default to the standard wording, look and headings', KEYS.every((k) => settings2[`ranking.${k}`] === STANDARD[k]) && settings2['ranking.formats'] === '' && settings2['ranking.columns'] === '' && settings2['ranking.colours'] === 'true');

  // ---- 8. Khmer digits ---------------------------------------------------------------------------------------------------------------------------
  must(await rest('PUT', '/settings/app', { 'report.khmerNumerals': 'true' }), 'settings');
  await page.locator('.user-menu-toggle').click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: t('nav.signOut') }).first().click();
  await field('username').waitFor({ timeout: 20_000 });
  await field('username').fill('admin.sokha');
  await field('password').fill(PW);
  await button(t('auth.login.submit')).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await page.locator('[data-testid=dashboard-figures]').waitFor({ timeout: 30_000 });
  await openCards();
  await openRankingPage();
  await makeRanking({ date: '2026-11-05' });
  const kh = await page.locator('.ranking-sheet').first().innerText();
  const khRows = await page.evaluate(() => [...document.querySelectorAll('[data-testid=ranking-row]')].slice(0, 2).map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  check('RK-8 with Khmer digits switched on, the numbers, ranks, totals, figures and the date are in Khmer digits and no Arabic digit is left anywhere on the list',
    !/[0-9]/.test(kh) && /[០-៩]/.test(khRows[0][0]) && khRows[0][5] === '១' && khRows[1][5] === '២' && kh.includes('ថ្ងៃទី៥ ខែវិច្ឆិកា ឆ្នាំ២០២៦'), JSON.stringify(khRows[0]));
  await shot('06-khmer-digits');
  await back();

  // ---- 9. nothing stored in the browser, no CSP violation, no console error, local origins only ------------------------------------------------------
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
  check('RK-9a the program stores nothing in the browser (localStorage, sessionStorage, cookies are empty)', stored.local === 0 && stored.session === 0 && stored.cookies === '', JSON.stringify(stored));
  const csp = await page.evaluate(() => window.__csp);
  check('RK-9b no CSP violation, no console error, and only app://school and the local backend were contacted', csp.length === 0 && consoleErrors.length === 0 && [...origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)),
    [...csp, ...consoleErrors, ...[...origins].filter((o) => o !== 'app://school' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(o))].slice(0, 3).join(' | '));

  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('RK-10 quitting stops the app and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { const p = app?.windows().find((w) => w.url().startsWith('app://school')); if (p) await p.screenshot({ path: path.join(outDir, 'ranking-e2e-FAIL.png') }); } catch { /* ignore */ }
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
