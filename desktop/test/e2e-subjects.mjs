// Subjects with sub-subjects (V8) in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public):
//   1. Settings -> Academic: a sub-subject is added under its main subject (from the main subject's own button and from the general form), shown indented; it is offered
//      to the grades its main subject is offered to
//   1b. the subject list and the grade table are PAGED (5 main subjects to a page, a main subject always with its sub-subjects): the page buttons, "all", the choice kept while the
//      program is open, and a subject that was just added is shown on its own page
//   2. the grade table: a sub-subject can only be ticked for a grade that studies its main subject; switching the main subject off takes its sub-subjects with it
//   3. an examination copies the structure: a main subject made of sub-subjects shows its maximum as their sum (read-only), a placeholder warning is shown until the
//      first score, a sub-subject can be added and removed while nothing is entered
//   4. scores are typed at the lowest level (sub-subjects listed under their main subject, a plain subject on its own); the results list MAIN subjects only and the
//      totals count each once (never a sub-subject on top of its main subject)
//   5. from the first score the structure is frozen on the screen (nothing added or removed; a maximum can still be corrected)
//   6. the report card lists main subjects; with its Settings switch on it lists the sub-subjects under them, and it is still one A4 page per card
//   7. HISTORY: renaming a subject and switching a sub-subject off afterwards changes nothing in an examination that already exists (results and report cards are
//      byte for byte the same), while a new examination gets the new names
//   7b. a subject nothing uses can be removed (after a confirmation, and a main subject only after its sub-subjects); one an examination uses cannot, its button says why
//   8. nothing is stored in the browser, no CSP violation, no console error, only local origins
// A year, a class, three pupils are seeded through the backend's own REST API; everything that is checked is done through the real UI. All people are invented.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-subjects.mjs
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

const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const EXAM = 'ប្រឡងមុខវិជ្ជាក្រុម';
const ART = 'សិល្បៈ';
const MAIN = 'មុខវិជ្ជាក្រុមធំ';
const MAIN_NEW = 'មុខវិជ្ជាក្រុមធំ (ឈ្មោះថ្មី)';
const SUBS = ['ផ្នែក ១', 'ផ្នែក ២', 'ផ្នែក ៣'];
const PUPILS = ['កក សិស្សមួយ', 'ខខ សិស្សពីរ', 'គគ សិស្សបី'];
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
  const toast = (text) => page.locator('.toast.show', { hasText: text }).first();
  const mainWindowCall = (fn, arg) => app.evaluate(({ BrowserWindow }, a) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    return new Function('win', 'a', `return (${a.fn})(win, a.arg)`)(win, a);
  }, { fn: fn.toString(), arg });
  const shot = async (name) => {
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
    await page.screenshot({ path: path.join(outDir, `subjects-e2e-${name}.png`) });
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

  // ---- seed: a year, a class of grade 1 with three pupils, a main subject --------------------------------------------------------------------
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
  const grade1 = grades[0].id;
  const classId = must(await rest('POST', '/classes', { academicYearId: year.id, gradeId: grade1, nameKm: 'ក', capacity: null, homeroomTeacherId: null, shift: null }), 'class').schoolClass.id;
  for (const name of PUPILS) must(await rest('POST', '/students', { nameKm: name, gender: 'FEMALE', dateOfBirth: '2019-01-01', enrollmentDate: null, classId, allowDuplicate: false, guardians: [] }), `pupil ${name}`);
  const roster = must(await rest('GET', `/classes/${classId}/students`), 'roster').sort((a, b) => PUPILS.indexOf(a.nameKm) - PUPILS.indexOf(b.nameKm));
  const mainId = must(await rest('POST', '/subjects', { nameKm: MAIN }), 'main subject').id;
  await mainWindowCall((win) => { win.unmaximize(); win.setContentSize(1366, 1100); });
  const subjectsNow = async () => (await rest('GET', '/subjects')).json;
  const idOf = async (name) => (await subjectsNow()).find((s) => s.nameKm === name)?.id;
  const gradeIds = async (level) => (await rest('GET', '/grades')).json.find((g) => g.level === level).subjectIds;

  // ---- 1. Settings -> Academic: sub-subjects under their main subject -----------------------------------------------------------------------------
  await goTo('/settings/academic', heading(t('academic.year.title')));
  const item = (name) => page.locator('li.subject-item').filter({ has: page.locator('label', { hasText: name }) });
  // ---- 0. the lists are paged: nine main subjects (the eight starting ones and the new one) show five to a page ---------------------------------------------------------
  const pager = page.locator('[data-testid=subjects-pager]');
  await pager.waitFor({ timeout: 15_000 });
  const info = (from, to, total) => t('pager.showing').replace('{from}', from).replace('{to}', to).replace('{total}', total).replace('{unit}', t('academic.subjects.unit'));
  const infoText = (list) => list.locator('[data-testid=pager-info]').innerText();
  const mainRows = () => page.locator('li.subject-item[data-kind=main]').count();
  check('SB-0a the subject list shows 5 main subjects on the first page and says "1-5 of 9"; the new main subject (the ninth) is not on it',
    (await mainRows()) === 5 && (await infoText(pager)) === info(1, 5, 9) && (await page.locator('li.subject-item', { hasText: MAIN }).count()) === 0);
  await pager.locator('[data-testid=pager-next]').click();
  check('SB-0b "next" shows the other four, says "6-9 of 9", has the new main subject, and "next" and "last" are off now',
    (await mainRows()) === 4 && (await infoText(pager)) === info(6, 9, 9) && (await page.locator('li.subject-item', { hasText: MAIN }).count()) === 1
    && (await pager.locator('[data-testid=pager-next]').isDisabled()) && (await pager.locator('[data-testid=pager-last]').isDisabled()));
  await pager.locator('[data-testid=pager-first]').click();
  check('SB-0c "first" goes back to page 1 ("1-5 of 9"), where "first" and "previous" are off', (await infoText(pager)) === info(1, 5, 9) && (await pager.locator('[data-testid=pager-first]').isDisabled()) && (await pager.locator('[data-testid=pager-previous]').isDisabled()));
  const gradePager = page.locator('[data-testid=grade-subjects-pager]');
  await gradePager.waitFor({ timeout: 15_000 });
  check('SB-0d the grade table is paged the same way: 5 main subjects, "1-5 of 8" (it lists the subjects that are switched on: the starting English subject is off)', (await page.locator('tr[data-kind=main]').count()) === 5 && (await infoText(gradePager)) === info(1, 5, 8));
  await pager.locator('[data-testid=pager-size]').selectOption('10');
  check('SB-0e choosing 10 to a page puts all nine on one page ("1-9 of 9")', (await mainRows()) === 9 && (await infoText(pager)) === info(1, 9, 9));
  await pager.locator('[data-testid=pager-size]').selectOption('0');
  await gradePager.locator('[data-testid=pager-size]').selectOption('0');
  check('SB-0f "all" shows every main subject in both lists (9 in the list, 8 switched on in the grade table)', (await mainRows()) === 9 && (await page.locator('tr[data-kind=main]').count()) === 8);
  // the choice is kept while the program is open (in memory: the browser stores nothing, SB-8a): leaving the page and coming back finds "all" again
  await goTo('/classes', heading(t('classes.title')));
  await goTo('/settings/academic', heading(t('academic.year.title')));
  await page.locator('li.subject-item').first().waitFor({ timeout: 15_000 });
  check('SB-0g coming back to the page finds both lists as they were left ("all" to a page)', (await mainRows()) === 9 && (await pager.locator('[data-testid=pager-size]').inputValue()) === '0' && (await gradePager.locator('[data-testid=pager-size]').inputValue()) === '0');
  await item(MAIN).waitFor({ timeout: 15_000 });
  const createSubject = async (name) => {
    await field('nameKm').fill(name);
    await button(t('academic.subjects.create')).click();
    await page.locator('li.subject-item', { hasText: name }).first().waitFor({ timeout: 15_000 });
    await field('nameKm').waitFor({ state: 'detached', timeout: 15_000 });
  };
  for (const name of SUBS.slice(0, 2)) {
    await page.locator(`[data-add-sub="${MAIN}"]`).click();
    if (name === SUBS[0]) check('SB-1a "add sub-subject" on a main subject opens the form with that main subject already chosen', (await page.locator('#subject-parent').inputValue()) === String(mainId));
    await createSubject(name);
  }
  await button(t('academic.subjects.add')).click();
  await page.selectOption('#subject-parent', String(mainId));   // the general form can place it too
  await createSubject(SUBS[2]);
  const listed = await page.locator('li.subject-item').evaluateAll((els) => els.map((e) => ({ kind: e.getAttribute('data-kind'), text: e.querySelector('label')?.textContent.replace(/\s+/g, ' ').trim() })));
  const at = listed.findIndex((x) => x.text?.startsWith(MAIN));
  check('SB-1b the three sub-subjects are listed right under their main subject, indented as sub-subjects',
    at >= 0 && listed.slice(at, at + 4).map((x) => x.kind).join() === 'main,sub,sub,sub' && SUBS.every((s, i) => listed[at + 1 + i]?.text?.startsWith(s)), JSON.stringify(listed.slice(at, at + 4)));
  const subIds = [];
  for (const name of SUBS) subIds.push(await idOf(name));
  const after = await subjectsNow();
  check('SB-1c each sub-subject points at its main subject and is offered to all six grades (the grades its main subject is offered to)',
    subIds.every((id) => after.find((s) => s.id === id)?.parentId === mainId) && (await Promise.all(grades.map((g) => gradeIds(g.level)))).every((ids) => subIds.every((id) => ids.includes(id)) && ids.includes(mainId)));
  check('SB-1d a sub-subject cannot be moved: its own form has no parent choice, only its name and the main subject it is part of', await (async () => {
    await item(SUBS[0]).getByRole('button', { name: t('academic.subjects.rename'), exact: false }).click();
    const noSelect = (await page.locator('#subject-parent').count()) === 0;
    const says = (await page.locator('.modal-content:visible').innerText()).includes(t('academic.subjects.partOf').replace('{subject}', MAIN));
    await button(t('common.cancel')).click();
    return noSelect && says;
  })());
  await shot('01-subject-list');

  // ---- 2. the grade table --------------------------------------------------------------------------------------------------------------------
  const matrixRow = (name) => page.locator('tr[data-kind]').filter({ has: page.locator('th', { hasText: name }) });
  const cell = (name, level) => matrixRow(name).locator(`td:nth-of-type(${level}) input`);
  await matrixRow(MAIN).waitFor({ timeout: 15_000 });
  check('SB-2a the grade table shows each sub-subject under its main subject, ticked for every grade', (await matrixRow(SUBS[0]).getAttribute('data-kind')) === 'sub' && (await cell(SUBS[0], 3).isChecked()) && (await cell(MAIN, 3).isChecked()));
  const waitGrade3 = async (predicate) => { for (let i = 0; i < 40; i++) { if (predicate(await gradeIds(3))) return true; await sleep(250); } return false; };
  await cell(MAIN, 3).click();
  const tookThemAll = await waitGrade3((ids) => !ids.includes(mainId) && subIds.every((id) => !ids.includes(id)));
  check('SB-2b switching the main subject off for grade 3 takes its three sub-subjects with it (and only for grade 3), and their ticks are disabled', tookThemAll
    && (await cell(SUBS[0], 3).isDisabled()) && !(await cell(SUBS[0], 3).isChecked()) && (await cell(SUBS[0], 4).isEnabled()) && (await cell(SUBS[0], 4).isChecked()) && (await gradeIds(4)).includes(mainId));
  await cell(MAIN, 3).click();
  await waitGrade3((ids) => ids.includes(mainId));
  check('SB-2c switching it back on does not bring the sub-subjects back by itself; they can be ticked one by one', (await cell(SUBS[0], 3).isEnabled()) && !(await cell(SUBS[0], 3).isChecked()) && !(await gradeIds(3)).includes(subIds[0]));
  for (const name of SUBS) { await cell(name, 3).click(); }
  check('SB-2d ticking them again restores grade 3', await waitGrade3((ids) => subIds.every((id) => ids.includes(id)) && ids.includes(mainId)));
  await shot('02-grade-table');

  // ---- 3. an examination copies the structure ------------------------------------------------------------------------------------------------
  const exam = must(await rest('POST', '/examinations', { academicYearId: year.id, nameKm: EXAM, kind: 'MONTHLY', termNo: 1, startDate: null, endDate: null }), 'examination');
  const examRows = (await rest('GET', `/examinations/${exam.id}/subjects`)).json;
  for (const r of examRows.filter((x) => x.gradeId === grade1 && x.subjectName !== MAIN && x.subjectName !== ART)) must(await rest('DELETE', `/examinations/${exam.id}/subjects/${r.id}`), 'trim');
  const artRow = (await rest('GET', `/examinations/${exam.id}/subjects`)).json.find((x) => x.gradeId === grade1 && x.subjectName === ART);
  must(await rest('PUT', `/examinations/${exam.id}/subjects/${artRow.id}`, { maxScore: 20, weight: 1 }), 'art max');
  await goTo('/exams', heading(t('exams.title')));
  await goTo(`/exams/${exam.id}`, heading(EXAM));
  await page.locator('#exam-tab-subjects').click();
  const subjectRow = (name) => page.locator(`tr[data-subject="${name}"]`);
  await subjectRow(MAIN).waitFor({ timeout: 15_000 });
  const maxInput = (name) => subjectRow(name).locator(`input[aria-label="${t('exams.maxScore')}"]`);
  check('SB-3a the examination lists the main subject made of sub-subjects (maximum 300 = three placeholder maxima, read-only) with its three sub-subjects under it, and Art as a plain subject',
    (await subjectRow(MAIN).getAttribute('data-kind')) === 'main-derived' && (await maxInput(MAIN).inputValue()) === '300' && (await maxInput(MAIN).isDisabled())
    && (await page.locator(`tr[data-kind=sub][data-parent="${MAIN}"]`).count()) === 3 && (await subjectRow(ART).getAttribute('data-kind')) === 'main' && (await maxInput(ART).isEnabled()));
  check('SB-3b until the first score a notice says the sub-subjects\' maxima are placeholders, and the structure is not frozen', (await page.locator('[data-testid=exam-sub-placeholder]').isVisible()) && (await page.locator('[data-testid=exam-frozen]').count()) === 0);
  const saveRow = (name) => subjectRow(name).getByRole('button', { name: t('common.save'), exact: true });
  const putSub = (name, max) => Promise.all([
    page.waitForResponse((r) => /\/sub-subjects\/\d+$/.test(r.url()) && r.request().method() === 'PUT' && r.ok(), { timeout: 15_000 }),
    (async () => { await maxInput(name).fill(max); await saveRow(name).click(); })(),
  ]);
  await putSub(SUBS[0], '10');
  await putSub(SUBS[1], '10');
  await putSub(SUBS[2], '20');
  await page.waitForFunction((v) => document.querySelector('tr[data-kind="main-derived"] input')?.value === v, '40', { timeout: 15_000 });
  check('SB-3c typing the sub-subjects\' maxima (10, 10, 20) makes the main subject 40 on the screen', (await maxInput(MAIN).inputValue()) === '40');
  const s4 = must(await rest('POST', '/subjects', { nameKm: 'ផ្នែក ៤', parentId: mainId }), 'S4').id;
  await goTo('/exams', heading(t('exams.title')));
  await goTo(`/exams/${exam.id}`, heading(EXAM));
  await page.locator('#exam-tab-subjects').click();
  await subjectRow(MAIN).waitFor({ timeout: 15_000 });
  await page.selectOption('#add-sub-subject', { label: `${MAIN} › ផ្នែក ៤` });
  await page.locator('#add-sub-max').fill('5');
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/sub-subjects') && r.request().method() === 'POST' && r.ok(), { timeout: 15_000 }), button(t('exams.addSubSubject')).click()]);
  await page.locator(`tr[data-subject="ផ្នែក ៤"]`).waitFor({ timeout: 15_000 });
  await page.waitForFunction((v) => document.querySelector('tr[data-kind="main-derived"] input')?.value === v, '45', { timeout: 15_000 });
  check('SB-3d a sub-subject added to the examination while nothing is entered appears under its main subject and the main subject becomes 45', (await maxInput(MAIN).inputValue()) === '45');
  await page.locator(`tr[data-subject="ផ្នែក ៤"] button[aria-label="${t('common.remove')}"]`).click();
  await page.locator('.modal-content').getByRole('button', { name: t('common.remove'), exact: true }).click();
  await page.locator(`tr[data-subject="ផ្នែក ៤"]`).waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction((v) => document.querySelector('tr[data-kind="main-derived"] input')?.value === v, '40', { timeout: 15_000 });
  check('SB-3e and taking it out again brings the main subject back to 40', (await maxInput(MAIN).inputValue()) === '40');
  await shot('03-exam-structure');

  // ---- 4. scores at the lowest level; the results list main subjects only -----------------------------------------------------------------------
  await page.locator('#exam-tab-scores').click();
  const options = await page.locator('#score-subject').evaluate((el) => ({
    groups: [...el.querySelectorAll('optgroup')].map((g) => ({ label: g.label, options: [...g.querySelectorAll('option')].map((o) => o.textContent.trim()) })),
    plain: [...el.children].filter((c) => c.tagName === 'OPTION').map((o) => o.textContent.trim()),
  }));
  check('SB-4a the subject choice lists the three sub-subjects together under their main subject (not the main subject itself), and Art on its own',
    options.groups.length === 1 && options.groups[0].label === MAIN && options.groups[0].options.join() === SUBS.join() && options.plain.join() === ART, JSON.stringify(options));
  const pickUnit = async (name, max, subjectId) => {
    if ((await page.locator('#score-subject').inputValue()) !== String(subjectId)) {
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'GET' && r.url().includes('/scores?') && r.url().includes(`subjectId=${subjectId}`) && r.ok(), { timeout: 15_000 }),
        page.locator('#score-subject').selectOption({ label: name }),
      ]);
    }
    await page.waitForFunction((p) => new RegExp(p).test(document.body.innerText), t('exams.maxIs').replace('{max}', max) + '(?![0-9])', { timeout: 15_000 });
    await page.locator('input[data-score-input]').first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
  };
  const enter = async (name, max, subjectId, values) => {
    await pickUnit(name, max, subjectId);
    const boxes = page.locator('input[data-score-input]');
    for (let i = 0; i < values.length; i++) {
      if (values[i] === 'A') await page.locator(`#absent-${roster[i].enrollmentId}`).check();
      else await boxes.nth(i).fill(String(values[i]));
    }
    await Promise.all([page.waitForResponse((r) => r.url().includes('/scores') && r.request().method() === 'PUT' && r.ok(), { timeout: 15_000 }), button(t('common.save')).click()]);
  };
  check('SB-4b before the first score the examination is not frozen', (await rest('GET', `/examinations/${exam.id}`)).json.frozen === false);
  const artId = await idOf(ART);
  await enter(SUBS[0], '10', subIds[0], [8, 6, 10]);
  check('SB-4c the first score of any kind freezes the structure', (await rest('GET', `/examinations/${exam.id}`)).json.frozen === true);
  await enter(SUBS[1], '10', subIds[1], [7.5, 'A', 10]);
  await enter(SUBS[2], '20', subIds[2], [15, 12, 20]);
  await enter(ART, '20', artId, [17, 10, 20]);

  // ---- the independent arithmetic: pupil 1 (8 + 7.5 + 15) + 17 = 47.5 of 60; pupil 2 (6 + 0 + 12) + 10 = 28 of 60 (absent counts 0); pupil 3 = 60 of 60
  await page.locator('#exam-tab-results').click();
  await page.locator('tr[data-student]:visible').first().waitFor({ timeout: 15_000 });
  const table = await page.locator('table:visible').first().innerText();
  const headers = await page.locator('table:visible').first().locator('thead th').allInnerTexts();
  const rowTexts = await page.locator('tr[data-student]:visible').allInnerTexts();
  check('SB-4d the results list MAIN subjects only: the main subject and Art are columns, no sub-subject is', headers.some((h) => h.includes(MAIN)) && headers.some((h) => h.includes(ART)) && SUBS.every((s) => !table.includes(s)), headers.join(' | '));
  check('SB-4e the totals count each main subject once: 47.5 of 60 = 79.17 %, 28 of 60 = 46.67 % (an absent sub-subject counts 0), 60 of 60 = 100 %; ranks 2, 3 and 1',
    /30\.5/.test(rowTexts[0]) && /79\.17/.test(rowTexts[0]) && /18/.test(rowTexts[1]) && /46\.67/.test(rowTexts[1]) && /100/.test(rowTexts[2]) && /^2\b/.test(rowTexts[0]) && /^3\b/.test(rowTexts[1]) && /^1\b/.test(rowTexts[2]), rowTexts.map((x) => x.replace(/\s+/g, ' ')).join(' / '));
  const apiResults = (await rest('GET', `/examinations/${exam.id}/results?classId=${classId}`)).json;
  check('SB-4f the backend says the same: two main subjects, totals 47.5 / 28 / 60 out of 60', apiResults.subjects.length === 2 && apiResults.students.map((s) => s.total).join() === '47.5,28,60' && apiResults.students.every((s) => s.totalMax === 60), JSON.stringify(apiResults.students.map((s) => s.total)));
  await shot('04-results');

  // ---- 5. frozen on the screen -----------------------------------------------------------------------------------------------------------------
  await page.locator('#exam-tab-subjects').click();
  await page.locator('[data-testid=exam-frozen]').waitFor({ timeout: 15_000 });
  const removeButtons = page.locator(`tr[data-subject] button[aria-label="${t('common.remove')}"]`);
  const removeStates = await removeButtons.evaluateAll((els) => els.map((e) => e.disabled));
  check('SB-5a once scores exist the screen says the structure is frozen, nothing can be added, and every remove button is off',
    (await page.locator('#add-subject').isDisabled()) && (await page.locator('#add-sub-subject').isDisabled()) && removeStates.length >= 5 && removeStates.every(Boolean), `${removeStates.length} buttons`);
  check('SB-5b a maximum can still be corrected: the sub-subjects\' and Art\'s maximum boxes are enabled, the main subject\'s (their sum) is not', (await maxInput(SUBS[0]).isEnabled()) && (await maxInput(ART).isEnabled()) && (await maxInput(MAIN).isDisabled()));
  check('SB-5c a maximum below a score already entered is refused by the backend, with Khmer wording on the screen', await (async () => {
    await maxInput(SUBS[0]).fill('9');
    await saveRow(SUBS[0]).click();
    const shown = await toast(t('validation.OUT_OF_RANGE')).waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
    await maxInput(SUBS[0]).fill('10');
    return shown;
  })());

  // ---- 6. the report card ----------------------------------------------------------------------------------------------------------------------
  const printCards = async () => {
    await goTo('/report-cards', page.locator('#card-exam'));
    await page.locator('#card-exam').selectOption({ label: EXAM });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=cards-table] tbody tr[data-student]').length > 0, null, { timeout: 20_000 });
    await page.locator('[data-testid=print-all]').click();
    await page.locator('.report-card').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
  };
  const leavePrint = async () => { await button(t('common.back')).click(); await page.locator('#card-exam').waitFor({ timeout: 20_000 }); };
  let pdfNo = 0;
  const pdfPages = async () => {
    const file = path.join(outDir, `subjects-e2e-${++pdfNo}.pdf`);
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('print.savePdf')).click();
    for (let i = 0; i < 60 && !existsSync(file); i++) await sleep(250);
    await sleep(300);
    const pdf = existsSync(file) ? readFileSync(file).toString('latin1') : '';
    rmSync(file, { force: true });
    return pdf.startsWith('%PDF-') ? (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length : -1;
  };
  await printCards();
  const cardSubjectNames = await page.locator('.report-card').first().locator('.report-card-scores tbody tr').evaluateAll((els) => els.map((e) => e.children[1]?.textContent.trim()));
  check('SB-6a by default the report card lists main subjects only (Art, then the main subject, in the order of the subject list), 3 cards, no sub-subject row', (await page.locator('.report-card').count()) === 3 && (await page.locator('[data-testid=report-card-sub]').count()) === 0 && cardSubjectNames.join() === `${ART},${MAIN}`, cardSubjectNames.join());
  const cardsBefore = (await rest('GET', `/report-cards/data?examinationId=${exam.id}&classId=${classId}`)).body;
  const resultsBefore = (await rest('GET', `/examinations/${exam.id}/results?classId=${classId}`)).body;
  const rowsBefore = (await rest('GET', `/examinations/${exam.id}/subjects`)).body;
  await leavePrint();
  await goTo('/settings/report-card', page.locator('[data-testid=card-template-form]'));
  await page.locator('[data-testid=card-template-preview] .report-card').waitFor({ timeout: 15_000 });
  check('SB-6b the card settings have the switch "show sub-subjects", off by default, and the preview shows none', !(await page.locator('#card-opt-subs').isChecked()) && (await page.locator('[data-testid=card-template-preview] [data-testid=report-card-sub]').count()) === 0);
  await page.locator('#card-opt-subs').click();
  check('SB-6c switching it on shows the sample card\'s two sub-subject rows under its first subject at once', (await page.locator('[data-testid=card-template-preview] [data-testid=report-card-sub]').count()) === 2);
  await page.locator('[data-testid=card-template-save]').click();
  await toast(t('reportCardTemplate.saved')).waitFor({ timeout: 15_000 });
  await printCards();
  const subRows = await page.locator('[data-testid=report-card-sub]').evaluateAll((els) => els.map((e) => [...e.children].map((c) => c.textContent.trim().replace(/\s+/g, ' '))));
  const firstCardRows = subRows.slice(0, 3);
  check('SB-6d with it on, every card lists the three sub-subjects under the main subject with their maximum and the pupil\'s score (9 rows for 3 cards; pupil 1: 8, 7.5, 15 of 10, 10, 20)',
    subRows.length === 9 && firstCardRows.map((r) => r[1]).join() === SUBS.map((s) => `↳ ${s}`).join() && firstCardRows.map((r) => r[4]).join() === '8,7.5,15' && firstCardRows.map((r) => r[2]).join() === '10,10,20', JSON.stringify(firstCardRows));
  const absentRow = subRows[4];
  check('SB-6e a sub-subject the pupil missed is shown as absent (pupil 2, second sub-subject)', absentRow?.[4] === t('exams.absentShort'), JSON.stringify(absentRow));
  check('SB-6f the totals on the card are unchanged by the detail (47.5 / 60), and the real "Save as PDF" is still one A4 page per card (3 pages)',
    (await page.locator('.report-card').first().innerText()).includes('47.5') && (await pdfPages()) === 3);
  await shot('05-report-card-with-sub-subjects');
  await leavePrint();

  // ---- 7. history: renaming and switching off afterwards changes nothing in an existing examination -------------------------------------------------
  await goTo('/settings/academic', heading(t('academic.year.title')));
  await item(MAIN).getByRole('button', { name: t('academic.subjects.rename') }).click();
  await field('nameKm').fill(MAIN_NEW);
  await button(t('common.save')).click();
  await toast(t('academic.subjects.renamed')).waitFor({ timeout: 15_000 });
  await item(MAIN_NEW).waitFor({ timeout: 15_000 });
  await item(SUBS[1]).locator('input[type=checkbox]').click();   // switch the second sub-subject off
  for (let i = 0; i < 40 && (await subjectsNow()).find((s) => s.id === subIds[1])?.active; i++) await sleep(250);
  check('SB-7a the subject list now says the new name and the second sub-subject is switched off', (await subjectsNow()).find((s) => s.id === mainId)?.nameKm === MAIN_NEW && (await subjectsNow()).find((s) => s.id === subIds[1])?.active === false);
  // removing before official use: only what nothing uses
  const removeBtn = (name) => item(name).locator('[data-remove]');
  check('SB-7f a subject an examination uses (Art, a sub-subject) cannot be removed, nor a main subject that still has sub-subjects: the button is off and says why',
    (await removeBtn(ART).isDisabled()) && (await removeBtn(SUBS[0]).isDisabled()) && (await removeBtn(MAIN_NEW).isDisabled()) && ((await removeBtn(ART).getAttribute('title')) ?? '') === t('academic.subjects.cannotRemoveInUse')
    && ((await removeBtn(MAIN_NEW).getAttribute('title')) ?? '') === t('academic.subjects.cannotRemoveInUse'));
  const THROWAWAY = 'មុខវិជ្ជាសាកល្បងលុប';
  const THROWAWAY_SUB = 'ផ្នែកសាកល្បងលុប';
  // paged again, on page 1 of 5 to a page: a main subject added now is the tenth, so the list must go to its page (the second) by itself to show it
  await pager.locator('[data-testid=pager-size]').selectOption('5');
  check('SB-7f2 back to 5 to a page the list is on page 1 ("1-5 of 9")', (await infoText(pager)) === info(1, 5, 9));
  await button(t('academic.subjects.add')).click();
  await createSubject(THROWAWAY);   // it waits for the new row, which is only on screen if the list jumped to the page that holds it
  check('SB-7f3 after adding it the list went to page 2 by itself and says "6-10 of 10"', (await infoText(pager)) === info(6, 10, 10));
  await pager.locator('[data-testid=pager-size]').selectOption('0');
  await page.locator(`[data-add-sub="${THROWAWAY}"]`).click();
  await createSubject(THROWAWAY_SUB);
  check('SB-7g a new subject nothing uses can be removed, but its main subject only after its sub-subject (the main subject\'s button is off until then)',
    (await removeBtn(THROWAWAY_SUB).isEnabled()) && (await removeBtn(THROWAWAY).isDisabled()) && ((await removeBtn(THROWAWAY).getAttribute('title')) ?? '') === t('academic.subjects.cannotRemoveHasSubs'));
  const removeThrough = async (name) => {
    await removeBtn(name).click();
    check(`SB-7h the confirmation names the subject (${name}) before anything is removed`, (await page.locator('.modal-content:visible').innerText()).includes(name));
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'DELETE' && /\/subjects\/\d+$/.test(r.url()) && r.status() === 204, { timeout: 15_000 }), page.locator('.modal-content:visible').getByRole('button', { name: t('common.remove'), exact: true }).click()]);
    await page.locator('li.subject-item', { hasText: name }).waitFor({ state: 'detached', timeout: 15_000 });
  };
  await removeThrough(THROWAWAY_SUB);
  await page.waitForFunction((n) => !!document.querySelector(`[data-remove="${n}"]`) && !document.querySelector(`[data-remove="${n}"]`).disabled, THROWAWAY, { timeout: 15_000 });
  await removeThrough(THROWAWAY);
  check('SB-7i both are gone from the list and from the backend, and the subjects an examination uses are still there', !(await subjectsNow()).some((x) => x.nameKm === THROWAWAY || x.nameKm === THROWAWAY_SUB) && (await subjectsNow()).some((x) => x.id === mainId) && (await subjectsNow()).some((x) => x.nameKm === ART));
  check('SB-7b the examination that already exists is byte for byte the same: its results, its report-card data and its own rows (with the old names)',
    (await rest('GET', `/examinations/${exam.id}/results?classId=${classId}`)).body === resultsBefore && (await rest('GET', `/report-cards/data?examinationId=${exam.id}&classId=${classId}`)).body === cardsBefore
    && (await rest('GET', `/examinations/${exam.id}/subjects`)).body === rowsBefore);
  await goTo('/exams', heading(t('exams.title')));
  await goTo(`/exams/${exam.id}`, heading(EXAM));
  await page.locator('#exam-tab-subjects').click();
  await subjectRow(MAIN).waitFor({ timeout: 15_000 });
  check('SB-7c on the screen the old examination still shows the name it was set up with and all three sub-subjects (the switched-off one too)',
    (await page.locator(`tr[data-kind=sub][data-parent="${MAIN}"]`).count()) === 3 && (await page.locator(`tr[data-subject="${MAIN_NEW}"]`).count()) === 0);
  await page.locator('#exam-tab-results').click();
  await page.locator('tr[data-student]:visible').first().waitFor({ timeout: 15_000 });
  check('SB-7d and so do its results', (await page.locator('table:visible').first().locator('thead th').allInnerTexts()).some((h) => h.includes(MAIN)) && !(await page.locator('table:visible').first().innerText()).includes('(ឈ្មោះថ្មី)'));
  const later = must(await rest('POST', '/examinations', { academicYearId: year.id, nameKm: 'ប្រឡងក្រោយការប្តូរ', kind: 'MONTHLY', termNo: 2, startDate: null, endDate: null }), 'later exam');
  const laterMain = (await rest('GET', `/examinations/${later.id}/subjects`)).json.find((x) => x.gradeId === grade1 && x.subjectId === mainId);
  check('SB-7e a NEW examination gets the new list: the new name, the sub-subjects that are switched on (the first, the third, and the fourth added since) and not the one switched off', laterMain.subjectName === MAIN_NEW && laterMain.subSubjects.map((x) => x.subjectName).join() === `${SUBS[0]},${SUBS[2]},ផ្នែក ៤`, JSON.stringify(laterMain.subSubjects.map((x) => x.subjectName)));

  // ---- 8. nothing stored in the browser, no CSP violation, no console error, local origins only -----------------------------------------------------
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
  check('SB-8a the program stores nothing in the browser (localStorage, sessionStorage, cookies are empty)', stored.local === 0 && stored.session === 0 && stored.cookies === '', JSON.stringify(stored));
  const csp = await page.evaluate(() => window.__csp);
  check('SB-8b no CSP violation, no console error, and only app://school and the local backend were contacted', csp.length === 0 && consoleErrors.length === 0 && [...origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)),
    [...csp, ...consoleErrors, ...[...origins].filter((o) => o !== 'app://school' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(o))].slice(0, 3).join(' | '));

  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('SB-9 quitting stops the app and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { const p = app?.windows().find((w) => w.url().startsWith('app://school')); if (p) await p.screenshot({ path: path.join(outDir, 'subjects-e2e-FAIL.png') }); } catch { /* ignore */ }
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
