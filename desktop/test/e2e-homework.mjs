// Homework as an INDEPENDENT module, in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public):
//   1. the form: a homework about a SUB-SUBJECT (shown as "main subject > sub-subject"), "has a score" asks for a maximum (typed, no default), a homework without it is a record only
//   2. the students' records: a status chosen by the teacher, a mark (typing one on a blank row means "submitted"; a status that cannot have a mark clears it), a remark; a mark above the
//      maximum or not a number is refused on the spot; "not handed in" is saved with NO mark (never a 0); the summary line and the list show who handed it in and the class average
//   3. a record can be cleared; a homework that has marks keeps its class and its scoring, its maximum can be corrected but not below a mark entered
//   4. the student's profile lists the homework history with the status, the mark out of the maximum and the remark
//   5. the three homework reports (the list of a class, the marks of one homework, the summary of the students): preview, the real "Save as PDF" is one A4 page, the Excel export accepts the table;
//      each says it is not part of the examination; a student with nothing marked has NO marks and NO percentage (not a zero); a subject filter includes its sub-subjects
//   6. THE RULE: examination results and report-card data are byte for byte the same after all of it
//   7. nothing is stored in the browser, no CSP violation, no console error, only local origins
// A year, a class, three pupils, subjects and one examination with scores are seeded through the backend's own REST API; everything else is done through the real UI. All people are invented.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-homework.mjs
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
const t = (key, params = {}) => {
  const v = key.split('.').reduce((n, p) => n?.[p], km);
  if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`);
  return Object.entries(params).reduce((s, [k, x]) => s.replaceAll(`{${k}}`, String(x)), v);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
/** Printed pages show Khmer digits; compare in ASCII. */
const ascii = (s) => String(s).replace(/[០-៩]/g, (d) => '០១២៣៤៥៦៧៨៩'.indexOf(d)).replace(/ /g, ' ').trim();

const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const MAIN = 'មុខវិជ្ជាក្រុម';
const SUB1 = 'ផ្នែក ១';
const SUB2 = 'ផ្នែក ២';
const PUPILS = ['កក សិស្សមួយ', 'ខខ សិស្សពីរ', 'គគ សិស្សបី'];   // already in Khmer name order
const HW_A = 'កិច្ចការមានពិន្ទុ';
const HW_B = 'កិច្ចការគ្មានពិន្ទុ';
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
    await page.screenshot({ path: path.join(outDir, `homework-e2e-${name}.png`) });
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

  // ---- seed: a year, a class of grade 1 with three pupils, a main subject with two sub-subjects, one examination with scores -------------------------
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
  const classId = must(await rest('POST', '/classes', { academicYearId: year.id, gradeId: grade1.id, nameKm: 'ក', capacity: null, homeroomTeacherId: null, shift: null }), 'class').schoolClass.id;
  const CLASS_LABEL = `${grade1.nameKm} ក`;
  for (const name of PUPILS) must(await rest('POST', '/students', { nameKm: name, gender: 'FEMALE', dateOfBirth: '2019-01-01', enrollmentDate: null, classId, allowDuplicate: false, guardians: [] }), `pupil ${name}`);
  const roster = must(await rest('GET', `/classes/${classId}/students`), 'roster').sort((a, b) => PUPILS.indexOf(a.nameKm) - PUPILS.indexOf(b.nameKm));
  const mainId = must(await rest('POST', '/subjects', { nameKm: MAIN }), 'main subject').id;
  for (const name of [SUB1, SUB2]) must(await rest('POST', '/subjects', { nameKm: name, parentId: mainId }), `sub-subject ${name}`);
  const khmer = (await rest('GET', '/subjects')).json.find((s) => s.code === 'KHMER');
  const exam = must(await rest('POST', '/examinations', { academicYearId: year.id, nameKm: 'ប្រឡងសាកល្បង', kind: 'MONTHLY', termNo: 1, startDate: null, endDate: null }), 'examination');
  must(await rest('PUT', `/examinations/${exam.id}/scores`, { classId, subjectId: khmer.id, scores: roster.map((r, i) => ({ enrollmentId: r.enrollmentId, score: [80, 65.5, 90][i], absent: false, remark: null })) }), 'examination scores');
  const resultsUrl = `/examinations/${exam.id}/results?classId=${classId}`;
  const cardsUrl = `/report-cards/data?examinationId=${exam.id}&classId=${classId}`;
  const resultsBefore = (await rest('GET', resultsUrl)).body;
  const cardsBefore = (await rest('GET', cardsUrl)).body;
  await mainWindowCall((win) => { win.unmaximize(); win.setContentSize(1366, 1100); });
  await page.waitForTimeout(500);

  const modal = page.locator('.modal.show');
  const row = (title) => page.locator(`tr[data-homework="${title}"]`);
  const subLabel = (name) => `${MAIN} › ${name}`;
  const saveModal = () => modal.getByRole('button', { name: t('common.save'), exact: true });
  const recordsOf = async (id) => (await rest('GET', `/homework/${id}/records`)).json;
  const rowOfPupil = (i) => modal.locator('tr[data-student]').filter({ hasText: PUPILS[i] });
  const mark = (i) => rowOfPupil(i).locator('input[data-score-input]');
  const statusOf = (i) => rowOfPupil(i).locator('select[data-record-status]');
  const remarkOf = (i) => rowOfPupil(i).locator('input[data-record-remark]');
  const putRecords = (id) => page.waitForResponse((r) => r.url().includes(`/homework/${id}/records`) && r.request().method() === 'PUT', { timeout: 15_000 });

  // ---- 1. the form --------------------------------------------------------------------------------------------------------------------------------
  await goTo('/homework', heading(t('homework.title')));
  await button(t('homework.add')).click();
  await modal.waitFor({ timeout: 15_000 });
  await modal.locator('select[id^="field-classId-"]').selectOption({ label: CLASS_LABEL });
  const subjectSelect = modal.locator('select[id^="field-subjectId-"]');
  const optionTexts = (await subjectSelect.locator('option').allInnerTexts()).map((s) => ascii(s));
  const at = optionTexts.indexOf(MAIN);
  check('HW-1a the subject picker lists a main subject with its sub-subjects right under it (indented, after a ›)', at >= 0 && optionTexts[at + 1] === `› ${ascii(SUB1)}` && optionTexts[at + 2] === `› ${ascii(SUB2)}`, JSON.stringify(optionTexts.slice(at, at + 3)));
  await subjectSelect.selectOption(await subjectSelect.locator('option', { hasText: SUB1 }).first().getAttribute('value'));
  await modal.locator('input[id^="field-title-"]').fill(HW_A);
  await modal.locator('input[id^="field-dueDate-"]').fill(dayOffset(2));
  check('HW-1b "has a score" starts OFF (a record only) and asks for no maximum', !(await modal.locator('[data-testid=homework-scored]').isChecked()) && (await modal.locator('input[id^="field-maxScore-"]').count()) === 0);
  await modal.locator('[data-testid=homework-scored]').check();
  const maxBox = modal.locator('input[id^="field-maxScore-"]');
  check('HW-1c switching it on shows an EMPTY maximum box (typed by the teacher, never a default)', (await maxBox.count()) === 1 && (await maxBox.inputValue()) === '');
  await saveModal().click();
  await modal.locator('.field-error').first().waitFor({ timeout: 15_000 });
  check('HW-1d saving without a maximum is refused on the spot ("required"), and the form stays open', (await modal.locator('.field-error').allInnerTexts()).some((x) => x.includes(t('validation.REQUIRED'))) && (await modal.count()) === 1);
  await maxBox.fill('abc');
  await saveModal().click();
  const textsAbc = await modal.locator('.field-error').allInnerTexts();
  await maxBox.fill('0');
  await saveModal().click();
  const textsZero = await modal.locator('.field-error').allInnerTexts();
  check('HW-1e "abc" is not a number and 0 is out of range', textsAbc.some((x) => x.includes(t('validation.INVALID_NUMBER'))) && textsZero.some((x) => x.includes(t('validation.OUT_OF_RANGE'))));
  await maxBox.fill('10');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/v1/homework') && r.request().method() === 'POST' && r.status() === 201, { timeout: 15_000 }), saveModal().click()]);
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await row(HW_A).waitFor({ timeout: 15_000 });
  // a homework without marks about a main subject
  await button(t('homework.add')).click();
  await modal.waitFor({ timeout: 15_000 });
  await modal.locator('select[id^="field-classId-"]').selectOption({ label: CLASS_LABEL });
  await modal.locator('select[id^="field-subjectId-"]').selectOption({ label: khmer.nameKm });
  await modal.locator('input[id^="field-title-"]').fill(HW_B);
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/v1/homework') && r.request().method() === 'POST' && r.status() === 201, { timeout: 15_000 }), saveModal().click()]);
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await row(HW_B).waitFor({ timeout: 15_000 });
  const listed = (await rest('GET', `/homework?classId=${classId}`)).json;
  const hwA = listed.find((h) => h.title === HW_A), hwB = listed.find((h) => h.title === HW_B);
  check('HW-1f the scored homework is about the sub-subject (main subject known) with maximum 10; the other has no maximum', hwA.subjectName === SUB1 && hwA.parentSubjectName === MAIN && hwA.maxScore === 10 && hwB.maxScore === null && hwB.parentSubjectName === null);
  check('HW-1g the list shows "main subject › sub-subject", who handed it in (0 of 3) and "no marks" for the record-only one',
    (await row(HW_A).innerText()).includes(subLabel(SUB1)) && (await row(HW_A).locator('[data-homework-summary]').innerText()).includes(t('homework.handedInOf', { done: 0, total: 3 }))
    && (await row(HW_A).locator('[data-homework-summary]').innerText()).includes(t('homework.markedOf', { done: 0, total: 3 })) && (await row(HW_B).locator('[data-homework-summary]').innerText()).includes(t('homework.noMarks')));
  await shot('1-homework-list');
  // the subject filter: the main subject includes its sub-subjects
  await page.locator('#homework-subject').selectOption({ label: MAIN });
  await row(HW_B).waitFor({ state: 'detached', timeout: 15_000 });
  await row(HW_A).waitFor({ timeout: 15_000 });   // the list was reloading: its rows come back
  check('HW-1h filtering by the main subject shows the homework about its sub-subject (and not the other)', (await row(HW_A).count()) === 1 && (await row(HW_B).count()) === 0);
  await page.locator('#homework-subject').selectOption({ label: t('homework.allSubjects') });
  await row(HW_B).waitFor({ timeout: 15_000 });

  // ---- 2. the students' records of the scored homework ------------------------------------------------------------------------------------------------
  await row(HW_A).locator('[data-homework-records]').click();
  await modal.locator('[data-testid=homework-records-table]').waitFor({ timeout: 15_000 });
  check('HW-2a the sheet lists the three pupils with a status, a mark column (it has a maximum) and a remark', (await modal.locator('tr[data-student]').count()) === 3 && (await modal.locator('thead th').count()) === 5);
  check('HW-2b every row starts "not recorded": no status, no mark, no remark', (await modal.locator('select[data-record-status]').evaluateAll((s) => s.every((x) => x.value === ''))) && (await mark(0).inputValue()) === '' && (await remarkOf(0).inputValue()) === '');
  check('HW-2c nothing to save yet', await saveModal().isDisabled());
  await mark(0).fill('11');
  const tooBig = (await rowOfPupil(0).locator('.field-error').innerText().catch(() => '')).includes(t('validation.OUT_OF_RANGE')) && (await saveModal().isDisabled());
  await mark(0).fill('x');
  const notNumber = (await rowOfPupil(0).locator('.field-error').innerText().catch(() => '')).includes(t('validation.INVALID_NUMBER')) && (await saveModal().isDisabled());
  check('HW-2d a mark above the maximum (11 of 10) or not a number is refused on the spot and Save stays off', tooBig && notNumber);
  await mark(0).fill('8.5');
  check('HW-2e typing a mark on a blank row means the work was handed in: its status becomes "submitted"', (await statusOf(0).inputValue()) === 'SUBMITTED');
  await statusOf(1).selectOption('LATE');
  await mark(1).fill('6');
  await mark(2).fill('5');
  await statusOf(2).selectOption('NOT_SUBMITTED');
  check('HW-2f choosing "not submitted" takes the mark away and switches the mark box off (never a 0)', (await mark(2).inputValue()) === '' && (await mark(2).isDisabled()));
  await remarkOf(2).fill('ភ្លេចយកមក');
  await remarkOf(0).fill('ល្អ');
  await shot('2-records-modal');
  const saved = putRecords(hwA.id);
  await saveModal().click();
  check('HW-2g saving answers 200', (await saved).status() === 200);
  await page.waitForFunction(() => document.querySelector('[data-testid=homework-records-summary]')?.textContent?.includes('72.5'), null, { timeout: 15_000 });
  const summaryText = await modal.locator('[data-testid=homework-records-summary]').innerText();
  check('HW-2h the summary line says 2 of 3 handed it in, 2 of 3 marked and the class average is 72.5 % ((8.5 + 6) of 2 x 10): the student who did not hand it in adds nothing, not even a 0',
    summaryText.includes(t('homework.handedInOf', { done: 2, total: 3 })) && summaryText.includes(t('homework.markedOf', { done: 2, total: 3 })) && summaryText.includes(t('homework.averageIs', { percent: '72.5' })), summaryText);
  const sheetA = await recordsOf(hwA.id);
  const byName = (name) => sheetA.rows.find((r) => r.nameKm === name);
  check('HW-2i the backend holds exactly that: 8.5 submitted, 6 late, and the third pupil "not submitted" with NO mark (null) and their remark',
    byName(PUPILS[0]).status === 'SUBMITTED' && byName(PUPILS[0]).score === 8.5 && byName(PUPILS[0]).remark === 'ល្អ' && byName(PUPILS[1]).status === 'LATE' && byName(PUPILS[1]).score === 6
    && byName(PUPILS[2]).status === 'NOT_SUBMITTED' && byName(PUPILS[2]).score === null && byName(PUPILS[2]).remark === 'ភ្លេចយកមក');
  await modal.locator('[data-testid=homework-records-close]').click();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await row(HW_A).locator('[data-homework-summary]').getByText(t('homework.averageIs', { percent: '72.5' }), { exact: false }).waitFor({ timeout: 15_000 });
  check('HW-2j the list shows the new figures without reloading the page (handed in 2 of 3, marked 2 of 3, average 72.5 %)',
    (await row(HW_A).locator('[data-homework-summary]').innerText()).includes(t('homework.handedInOf', { done: 2, total: 3 })) && (await row(HW_A).locator('[data-homework-summary]').innerText()).includes(t('homework.markedOf', { done: 2, total: 3 })));

  // ---- the record-only homework: statuses and remarks without a mark column --------------------------------------------------------------------------
  await row(HW_B).locator('[data-homework-records]').click();
  await modal.locator('[data-testid=homework-records-table]').waitFor({ timeout: 15_000 });
  check('HW-2k a homework without a maximum has no mark column (four columns) but still has statuses and remarks', (await modal.locator('thead th').count()) === 4 && (await mark(0).count()) === 0);
  await statusOf(0).selectOption('SUBMITTED');
  await statusOf(1).selectOption('EXCUSED');
  await remarkOf(1).fill('ឈឺ');
  const savedB = putRecords(hwB.id);
  await saveModal().click();
  check('HW-2l saving the statuses answers 200', (await savedB).status() === 200);
  const sheetB = await recordsOf(hwB.id);
  check('HW-2m the backend holds the statuses and no mark at all', sheetB.rows.find((r) => r.nameKm === PUPILS[0]).status === 'SUBMITTED' && sheetB.rows.find((r) => r.nameKm === PUPILS[1]).status === 'EXCUSED' && sheetB.rows.every((r) => r.score === null));
  // clearing a record: a blank status and an empty remark delete it
  await statusOf(1).selectOption('');
  await remarkOf(1).fill('');
  const clearedB = putRecords(hwB.id);
  await saveModal().click();
  await clearedB;
  check('HW-3a a blank status with an empty remark clears the record (back to "not recorded")', (await recordsOf(hwB.id)).rows.find((r) => r.nameKm === PUPILS[1]).status === null);
  await modal.locator('[data-testid=homework-records-close]').click();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });

  // ---- 3. what may change once marks exist ------------------------------------------------------------------------------------------------------------------
  await row(HW_A).getByRole('button', { name: t('common.edit'), exact: true }).click();
  await modal.waitFor({ timeout: 15_000 });
  check('HW-3b the homework that has records keeps its class (the box is off) and its marks (the switch is off), with the reason shown',
    (await modal.locator('select[id^="field-classId-"]').isDisabled()) && (await modal.locator('[data-testid=homework-scored]').isDisabled()) && (await modal.innerText()).includes(t('homework.hasScoreLocked')));
  const maxEdit = modal.locator('input[id^="field-maxScore-"]');
  check('HW-3c the maximum shows 10', (await maxEdit.inputValue()) === '10');
  await maxEdit.fill('8');
  await saveModal().click();
  await modal.locator('.field-error').first().waitFor({ timeout: 15_000 });
  check('HW-3d a maximum below a mark already entered (8 against 8.5) is refused by the program, and the form stays open', (await modal.locator('.field-error').allInnerTexts()).some((x) => x.includes(t('validation.OUT_OF_RANGE'))) && (await modal.count()) === 1);
  await maxEdit.fill('12');
  await Promise.all([page.waitForResponse((r) => /\/homework\/\d+$/.test(r.url()) && r.request().method() === 'PUT' && r.status() === 200, { timeout: 15_000 }), saveModal().click()]);
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await row(HW_A).locator('[data-homework-summary]').getByText(t('homework.averageIs', { percent: '60.42' }), { exact: false }).waitFor({ timeout: 15_000 });
  check('HW-3e correcting it to 12 is allowed, and the class average follows: (8.5 + 6) of 2 x 12 = 60.42 %', true);

  // ---- 4. the student's profile ---------------------------------------------------------------------------------------------------------------------------------
  await goTo('/students', heading(t('students.title')));
  await page.locator(`a[href="/students/${roster[0].studentId}"]`).first().click();
  await page.locator('[data-testid=student-homework]').waitFor({ timeout: 30_000 });
  await page.locator('[data-homework-row]').first().waitFor({ timeout: 15_000 });
  const profile = page.locator('[data-testid=student-homework]');
  const figures = ascii(await profile.locator('[data-testid=student-homework-figures]').innerText());
  check('HW-4a the profile lists the pupil\'s homework (two assignments), newest first, with the sub-subject shown under its main subject', (await profile.locator('[data-homework-row]').count()) === 2 && (await profile.innerText()).includes(subLabel(SUB1)));
  check('HW-4b the A row shows the status, the mark out of the maximum (8.5 / 12) and the remark', (await profile.locator(`[data-homework-row="${HW_A}"]`).innerText()).includes(t('homework.record.SUBMITTED')) && ascii(await profile.locator(`[data-homework-row="${HW_A}"]`).innerText()).includes('8.5 / 12') && (await profile.locator(`[data-homework-row="${HW_A}"]`).innerText()).includes('ល្អ'));
  check('HW-4c the figures: 2 assignments, both submitted, and marks 8.5 of 12 = 70.83 % (only the marked one counts)',
    figures.includes(ascii(t('students.homeworkFigures', { assigned: 2, submitted: 2, late: 0, notSubmitted: 0, excused: 0, notRecorded: 0 }))) && figures.includes(ascii(t('students.homeworkEarned', { earned: '8.5', possible: '12', percent: '70.83' }))), figures);
  check('HW-4d the profile says homework is not part of the examination', (await profile.innerText()).includes(t('students.homeworkNote')));
  await profile.scrollIntoViewIfNeeded();
  await shot('3-student-homework');

  // ---- 5. the three homework reports --------------------------------------------------------------------------------------------------------------------------------
  let pdfNo = 0;
  const pdfPages = async () => {
    const file = path.join(outDir, `homework-e2e-${++pdfNo}.pdf`);
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('print.savePdf')).click();
    for (let i = 0; i < 60 && !existsSync(file); i++) await sleep(250);
    await sleep(300);
    const pdf = existsSync(file) ? readFileSync(file).toString('latin1') : '';
    rmSync(file, { force: true });
    return pdf.startsWith('%PDF-') ? (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length : -1;
  };
  const sheetTable = async () => page.locator('[data-testid=report-sheet]').evaluate((el) => ({
    title: el.querySelector('h1')?.textContent ?? '', subtitle: el.querySelector('.report-sub')?.textContent ?? '',
    head: [...el.querySelectorAll('thead th')].map((x) => x.textContent.trim()), rows: [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((x) => x.textContent.trim())),
  }));
  // the export answers a spreadsheet, not JSON: only its status and type are read
  const exportOk = (table) => page.evaluate(async ({ body, token }) => {
    const info = await window.desktop.getInfo();
    const res = await fetch(`${info.backendBaseUrl}/api/v1/reports/export`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const bytes = new Uint8Array(await res.arrayBuffer());
    return res.status === 200 && /spreadsheetml/.test(res.headers.get('content-type') ?? '') && bytes[0] === 0x50 && bytes[1] === 0x4b;   // a zip (xlsx) starts with PK
  }, { token: apiToken, body: { sheetName: table.title.slice(0, 31), title: table.title, subtitle: table.subtitle, columns: table.head.map((label) => ({ label, type: 'TEXT', width: 14 })), rows: table.rows } });
  const chooseReport = async (name) => { await page.locator('label', { has: page.locator(`input[data-report=${name}]`) }).click(); await page.waitForTimeout(300); };
  const preview = async () => { await page.locator('[data-testid=report-preview]').click(); await page.locator('[data-testid=report-sheet]').waitFor({ timeout: 30_000 }); await page.waitForTimeout(500); };
  const backToReports = async () => { await page.getByRole('button', { name: t('common.back'), exact: true }).first().click(); await heading(t('reports.title')).waitFor({ timeout: 15_000 }); };
  const dateTo = dayOffset(10);

  await goTo('/reports', heading(t('reports.title')));
  check('HW-5a the Reports page has its own "homework" group (independent of the examination results) with three reports', (await page.locator('[data-testid=report-group-homework]').innerText()).includes(t('reports.homeworkGroup')) && (await page.locator('input[data-report^=homework]').count()) === 3);
  // report 1: the list of the class's homework in a period
  await chooseReport('homework');
  await page.locator('#report-to').fill(dateTo);
  await preview();
  const r1 = await sheetTable();
  const r1rows = r1.rows.map((r) => r.map(ascii));
  const rowA = r1rows.find((r) => r[3] === HW_A);
  check('HW-5b the list of homework: both assignments, the sub-subject under its main subject, the maximum 12, 3 students, 1 submitted, 1 late, 2 marked and the average 60.42; it says it is not part of the examination',
    r1.title === t('reports.homework.title') && r1rows.length === 2 && rowA[2] === ascii(subLabel(SUB1)) && rowA[5] === '12' && rowA[6] === '3' && rowA[7] === '1' && rowA[8] === '1' && rowA[11] === '2' && rowA[12] === '60.42'
    && r1.subtitle.includes(t('reports.homework.notExam')), JSON.stringify(rowA));
  check('HW-5c the printed page is one A4 page (the real "Save as PDF")', (await pdfPages()) === 1);
  check('HW-5d the Excel export accepts the table (and its subtitle is within the limit)', (await exportOk(r1)) && r1.subtitle.length <= 300);
  await shot('4-report-homework-list');
  await backToReports();

  // report 2: the marks of one homework
  await chooseReport('homeworkMarks');
  const pick = page.locator('#report-homework');
  await pick.selectOption(await pick.locator('option', { hasText: HW_A }).first().getAttribute('value'));
  await preview();
  const r2 = await sheetTable();
  const r2rows = r2.rows.map((r) => r.map(ascii));
  check('HW-5e the marks of one homework: the pupils in name order with status, mark, percentage and remark; the one who did not hand it in has NO mark and NO percentage',
    r2.title === t('reports.homeworkMarks.title') && r2rows.map((r) => r[2]).join('|') === PUPILS.join('|') && r2rows[0][3] === t('homework.record.SUBMITTED') && r2rows[0][4] === '8.5' && r2rows[0][5] === '70.83' && r2rows[0][6] === 'ល្អ'
    && r2rows[1][3] === t('homework.record.LATE') && r2rows[1][4] === '6' && r2rows[1][5] === '50' && r2rows[2][3] === t('homework.record.NOT_SUBMITTED') && r2rows[2][4] === '' && r2rows[2][5] === '' && r2.subtitle.includes(t('reports.homework.notExam')), JSON.stringify(r2rows));
  check('HW-5f it is one A4 page and the Excel export accepts it', (await pdfPages()) === 1 && (await exportOk(r2)) && r2.subtitle.length <= 300);
  await shot('5-report-homework-marks');
  await backToReports();

  // report 3: the summary of the students, optionally about one subject
  await chooseReport('homeworkSummary');
  await page.locator('#report-to').fill(dateTo);
  await preview();
  const r3 = await sheetTable();
  const r3rows = r3.rows.map((r) => r.map(ascii));
  // columns: no, code, name, assigned, submitted, late, not submitted, excused, not recorded, earned, possible, percent
  check('HW-5g the summary: pupil 1 has 2 assigned, 2 submitted and 8.5 of 12 = 70.83; pupil 2 has 1 late, 1 not recorded and 6 of 12 = 50',
    r3.title === t('reports.homeworkSummary.title') && r3rows[0][3] === '2' && r3rows[0][4] === '2' && r3rows[0][8] === '0' && r3rows[0][9] === '8.5' && r3rows[0][10] === '12' && r3rows[0][11] === '70.83'
    && r3rows[1][5] === '1' && r3rows[1][8] === '1' && r3rows[1][9] === '6' && r3rows[1][11] === '50', JSON.stringify(r3rows));
  check('HW-5h pupil 3 did not hand in A and has nothing recorded for B: counted as "not submitted" and "not recorded", with NO marks, NO maximum and NO percentage (not a zero)',
    r3rows[2][6] === '1' && r3rows[2][8] === '1' && r3rows[2][9] === '' && r3rows[2][10] === '' && r3rows[2][11] === '', JSON.stringify(r3rows[2]));
  check('HW-5i the subtitle says how the marks are counted and that it is not part of the examination', r3.subtitle.includes(t('reports.homeworkSummary.method')) && r3.subtitle.includes(t('reports.homework.notExam')));
  check('HW-5j it is one A4 page and the Excel export accepts it', (await pdfPages()) === 1 && (await exportOk(r3)) && r3.subtitle.length <= 300);
  await shot('6-report-homework-summary');
  await backToReports();
  // limited to the main subject: its sub-subject's homework (A) counts, Art / Khmer's (B) does not
  await chooseReport('homeworkSummary');
  await page.locator('#report-to').fill(dateTo);
  await page.locator('#report-subject').selectOption({ label: MAIN });
  await preview();
  const r3b = (await sheetTable());
  check('HW-5k limited to the main subject the summary counts only the homework about it and its sub-subjects (1 assignment each) and names the subject', r3b.rows.every((r) => ascii(r[3]) === '1') && r3b.subtitle.includes(MAIN));
  await backToReports();

  // ---- 6. THE RULE: nothing an examination shows has moved ---------------------------------------------------------------------------------------------------------
  check('HW-6a the examination results (totals, ranks) are byte for byte the same as before any homework mark existed', (await rest('GET', resultsUrl)).body === resultsBefore);
  check('HW-6b and so is the report-card data', (await rest('GET', cardsUrl)).body === cardsBefore);
  const cardJson = JSON.stringify(JSON.parse(cardsBefore));
  check('HW-6c neither mentions homework', !/homework/i.test(resultsBefore) && !/homework/i.test(cardJson));

  // ---- 7. nothing stored in the browser, no CSP violation, no console error, local origins only -----------------------------------------------------
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
  check('HW-7a the program stores nothing in the browser (localStorage, sessionStorage, cookies are empty)', stored.local === 0 && stored.session === 0 && stored.cookies === '', JSON.stringify(stored));
  const csp = await page.evaluate(() => window.__csp);
  check('HW-7b no CSP violation, no console error, and only app://school and the local backend were contacted', csp.length === 0 && consoleErrors.length === 0 && [...origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)),
    [...csp, ...consoleErrors, ...[...origins].filter((o) => o !== 'app://school' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(o))].slice(0, 3).join(' | '));

  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('HW-8 quitting stops the app and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { const p = app?.windows().find((w) => w.url().startsWith('app://school')); if (p) await p.screenshot({ path: path.join(outDir, 'homework-e2e-FAIL.png') }); } catch { /* ignore */ }
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
