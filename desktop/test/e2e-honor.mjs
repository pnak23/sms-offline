// The roll of honour (តារាងកិត្តិយស) in the REAL Electron shell with the REAL UI and backend (unpackaged: desktop/dist + frontend/.output/public):
//   1. the roll of honour is a PAGE of its own (not a window): the Report cards page links to it with the examination and class, and it starts on the standard wording and the ten artwork choices
//   2. the top 5 and the top 10 in rank order, from the same ranks the backend gives the report cards; the layout rows 1,2,2 and 1,2,2,2,2,1
//   3. ties are never cut (a top 5 whose last rank is shared by two students lists six names and says so), an incomplete result is never listed
//   4. a very long name shrinks to its frame; extra lines in the text boxes (a line above the school, the lunar date above the date) do not break the page
//   4b. the national header (ព្រះរាជាណាចក្រកម្ពុជា / ជាតិ សាសនា ព្រះមហាក្សត្រ) and its flourish are ALWAYS at the top, in every style, even though the
//      "national header" switch of Settings → Printed reports is off (its default)
//   5. every one of the twenty styles, at 5 and at 10 names, fits one A4 page (measured, and counted in the real "Save as PDF" output), and the artwork never touches a printed line
//   6. "every class of the year": one sheet per class, a class with nobody ranked is left out and named
//   7. the ONE saved default (Settings → Roll of honour): the count, the style and the FIVE texts of the school's sample (top left block, subtitle, date lines, the two signature
//      titles) are saved once, with their spaces and line breaks and the words in braces; the options window starts from them, and choosing only a date prints the whole
//      certificate with the class, the month, the year and the date filled in (another date changes them by itself); each box has a font toolbar (font, size, bold, italic, underline,
//      alignment, keep each line on one line); BACK from the preview returns to the roll of honour page with everything chosen; it survives signing out. Khmer digits and the national header in the worst case
//   8. nothing is stored in the browser, no CSP violation, no console error, only local origins
// A year, three classes, a teacher, students and scores are seeded through the backend's own REST API (a second login for the test); everything that is
// checked is done through the real UI. All people are invented.
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-honor.mjs
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, luma } from './png-pixels.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktop = path.join(root, 'desktop');
const outDir = path.join(desktop, 'test', 'out');
mkdirSync(outDir, { recursive: true });
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const STANDARD = { header: '{school}\n{class}', subtitle: 'លទ្ធផល{exam}', dateLines: '{date}', titleRight: 'គ្រូប្រចាំថ្នាក់', titleLeft: 'បានឃើញ និងឯកភាព\nនាយក/នាយិកា' };
const HONOR_KEYS = Object.keys(STANDARD);
const ORIGINAL_STYLES = ['classic', 'lotus', 'angkor', 'star', 'royal', 'laurel', 'guilloche', 'kids', 'mono', 'sun'];
const NEW_STYLES = ['kbach', 'rice', 'palm', 'rose', 'moon', 'book', 'flag', 'vintage', 'modern', 'wave'];   // added 2026-11-06
const STYLES = [...ORIGINAL_STYLES, ...NEW_STYLES];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const DIRECTOR = 'លោក នាយក គំរូ';
const TEACHER = 'លោកស្រី គ្រូ គំរូ';
const EXAM = 'ប្រឡងប្រចាំខែតុលា';
const LONG_NAME = 'ស៊ុន សុវណ្ណារី ចាន់ទីតា វិចិត្រសិរីរតនា ម៉ាលីណា';
const data = mkdtempSync(path.join(tmpdir(), 'sms ទិន្នន័យ '));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;

// percent of each student of class ក: two students tie on rank 5 and one more student has an incomplete result; the long name is rank 3
const PERCENTS = [95, 90, 85, 80, 75, 75, 70, 65, 60, 55, 50, 45];
const NAMES_A = ['ជា សុខា', 'ហេង ដារា', LONG_NAME, 'ម៉ម វិចិត្រ', 'លី ស្រីមុំ', 'កែវ បូរី', 'ភឹម ចន្ថា', 'ទេព រតនា', 'ឈួន ធីតា', 'វ៉ាន់ សុវណ្ណ', 'គឹម ម៉ាលី', 'ម៉ៅ សោភ័ណ'];
const INCOMPLETE = 'ចាន់ មិនទាន់គ្រប់';

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
    await page.screenshot({ path: path.join(outDir, `honor-e2e-${name}.png`) });
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

  // ---- seed: a teacher, the director's name, a year with three classes, one examination, scores ------------------------------------------------
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
  const year = must(await rest('POST', '/academic-years', { nameKm: 'ឆ្នាំសាកល្បង', startDate: dayOffset(-60), endDate: dayOffset(200), makeCurrent: true }), 'year');
  const gradeId = must(await rest('GET', '/grades'), 'grades')[0].id;
  const makeClass = async (nameKm, homeroomTeacherId) => must(await rest('POST', '/classes', { academicYearId: year.id, gradeId, nameKm, capacity: null, homeroomTeacherId, shift: null }), `class ${nameKm}`).schoolClass.id;
  const classA = await makeClass('ក', teacher.id);
  const classB = await makeClass('ខ', null);
  const classC = await makeClass('គ', null);
  const addStudent = async (classId, nameKm) => must(await rest('POST', '/students', { nameKm, gender: 'FEMALE', dateOfBirth: '2019-01-01', enrollmentDate: null, classId, allowDuplicate: false, guardians: [] }), `student ${nameKm}`);
  for (const name of [...NAMES_A, INCOMPLETE]) await addStudent(classA, name);
  for (const name of ['អ៊ុក ពិសី', 'សៀង ដាលីន']) await addStudent(classB, name);
  await addStudent(classC, 'ស៊ុន តែម្នាក់ឯង');
  const exam = must(await rest('POST', '/examinations', { academicYearId: year.id, nameKm: EXAM, kind: 'MONTHLY', termNo: 10, startDate: null, endDate: null }), 'examination');
  const examSubjects = must(await rest('GET', `/examinations/${exam.id}/subjects`), 'subjects').filter((s) => s.gradeId === gradeId);
  const score = async (classId, percentOf) => {
    const roster = must(await rest('GET', `/classes/${classId}/students`), 'roster');
    for (const [s, subject] of examSubjects.entries()) {
      const scores = roster.flatMap((r) => {
        const percent = percentOf(r.nameKm);
        // the incomplete student is left without a mark in the LAST subject; a class with no percent has no marks at all
        if (percent === null || (r.nameKm === INCOMPLETE && s === examSubjects.length - 1)) return [];
        return [{ enrollmentId: r.enrollmentId, score: (percent * subject.maxScore) / 100, absent: false, remark: null }];
      });
      if (scores.length > 0) must(await rest('PUT', `/examinations/${exam.id}/scores`, { classId, subjectId: subject.subjectId, scores }), 'scores');
    }
  };
  await score(classA, (name) => (name === INCOMPLETE ? 99 : PERCENTS[NAMES_A.indexOf(name)] ?? null));
  await score(classB, (name) => ({ 'អ៊ុក ពិសី': 88, 'សៀង ដាលីន': 66 })[name] ?? null);
  // the backend's own ranks are what the printed roll must agree with
  const backendRanks = async (classId) => (must(await rest('GET', `/examinations/${exam.id}/results?classId=${classId}`), 'results').students)
    .filter((s) => s.rank !== null).map((s) => ({ rank: s.rank, name: s.nameKm })).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'und'));
  const ranksA = await backendRanks(classA);
  check('HR-0 the seeded class: 12 students are ranked (1,2,3,4,5,5,7,8,9,10,11,12) and the 13th, with a missing mark, has no rank',
    ranksA.map((r) => r.rank).join(',') === '1,2,3,4,5,5,7,8,9,10,11,12', ranksA.map((r) => r.rank).join(','));

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
  let current = 'ក';
  /** The roll of honour page is ready when it has an examination and a class (the print button is on). */
  const pageReady = () => page.waitForFunction(() => { const open = document.querySelector('[data-testid=honor-open]'); return !!open && !open.disabled; }, null, { timeout: 20_000 });
  const pickClass = async (name) => {
    // the class select's options read "<grade> <class>"; the class is the last word (a single Khmer letter is a substring of too much else)
    const select = page.locator('select[id^="picker-class-"]');
    const value = await select.evaluate((el, n) => [...el.options].find((o) => o.textContent.trim().endsWith(` ${n}`))?.value ?? null, name);
    if (value === null) throw new Error(`no class "${name}" in the picker`);
    await select.selectOption(value);
    current = name;
    await page.waitForFunction(() => {
      const open = document.querySelector('[data-testid=honor-open]');
      return open ? !open.disabled : document.querySelectorAll('[data-testid=cards-table] tbody tr[data-student]').length > 0;
    }, null, { timeout: 20_000 });
  };
  const sheets = () => page.locator('.honor-sheet');
  /** From the Report cards page (examination and class chosen) to the roll of honour page. */
  const openRollPage = async () => {
    await page.locator('[data-testid=honor-roll]').click();
    await page.locator('[data-testid=honor-form]').waitFor({ timeout: 15_000 });
    await pageReady();
  };
  /** On the roll of honour page: starts from the standard look (so every run is the same), applies the choices and opens the print page. */
  const makeRoll = async ({ count = 5, style = 'classic', texts = {}, date = isoLocal(new Date()), all = false } = {}) => {
    await page.locator('[data-testid=honor-def-reset]').click();
    await page.locator(`#honor-count-${count}`).check();
    await page.locator(`label[for="honor-style-${style}"]`).click();
    for (const [key, value] of Object.entries(texts)) await page.locator(`#honor-text-${key}`).fill(value);
    await page.locator('#honor-date').fill(date);
    if ((await page.locator('#honor-all').isChecked()) !== all) await page.locator('#honor-all').click();
    await page.locator('[data-testid=honor-open]').click();
    await page.waitForFunction(() => document.querySelectorAll('.honor-sheet [data-testid=honor-plate]').length > 0 || document.querySelector('[data-testid=honor-none]'), null, { timeout: 30_000 });
    await page.waitForTimeout(1200);   // the Khmer font arrives and the names settle into their frames
  };
  /** Back from the print page: it returns to the roll of honour page. */
  const back = async () => {
    await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
    await page.locator('[data-testid=honor-form]').waitFor({ timeout: 20_000 });
    await pageReady();
  };
  /** What the printed sheets look like: names, rows, the room they take, and whether anything leaves its frame or its page. */
  const measure = () => page.evaluate(() => [...document.querySelectorAll('.honor-sheet')].map((sheet) => {
    const pageEl = sheet.querySelector('.honor-page');
    const content = sheet.querySelector('.honor-content');
    const pr = pageEl.getBoundingClientRect();
    const plates = [...sheet.querySelectorAll('[data-testid=honor-plate]')];
    const inside = (r, box) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
    const names = [...sheet.querySelectorAll('[data-testid=honor-name]')];
    const text = (id) => sheet.querySelector(`[data-testid=${id}]`)?.textContent.trim() ?? null;
    const grid = sheet.querySelector('.honor-rows').getBoundingClientRect();
    return {
      cls: sheet.getAttribute('data-class'), style: sheet.getAttribute('data-style'),
      names: plates.map((p) => p.querySelector('.honor-name').textContent.trim().replace(/\s+/g, ' ')),
      ranks: plates.map((p) => p.getAttribute('data-rank')),
      rows: [...sheet.querySelectorAll('.honor-row')].map((r) => r.querySelectorAll('[data-testid=honor-plate]').length),
      pageHeight: Math.round(pr.height), pageWidth: Math.round(pr.width), contentFits: content.scrollHeight <= content.clientHeight + 1,
      platesInsideRowsArea: plates.every((p) => p.getBoundingClientRect().top >= grid.top - 1 && p.getBoundingClientRect().bottom <= grid.bottom + 1),
      platesInsidePage: plates.every((p) => inside(p.getBoundingClientRect(), pr)),
      namesInsideFrames: names.every((n) => inside(n.getBoundingClientRect(), n.parentElement.getBoundingClientRect())),
      namesFit: names.every((n) => n.scrollWidth <= n.clientWidth + 1 || n.hasAttribute('data-wrap')),
      shrunk: names.filter((n) => Number(n.style.getPropertyValue('--fit') || 1) < 1).length,
      national: sheet.querySelectorAll('[data-testid=honor-national] p').length,
      nationalText: [...sheet.querySelectorAll('[data-testid=honor-national] p')].map((p) => p.textContent.trim()),
      nationalFont: (() => { const p = sheet.querySelector('[data-testid=honor-national] p'); return p ? getComputedStyle(p).fontFamily : ''; })(),
      // the order down the page: national header, the flourish, the title, then the frames; and the header starts inside the page
      headOrder: (() => {
        const n = sheet.querySelector('[data-testid=honor-national]')?.getBoundingClientRect();
        const d = sheet.querySelector('.honor-divider svg')?.getBoundingClientRect();
        const ti = sheet.querySelector('.honor-title')?.getBoundingClientRect();
        const first = plates[0]?.getBoundingClientRect();
        return !!(n && d && ti && first) && n.top >= pr.top && n.bottom <= d.top + 1 && d.bottom <= ti.top + 1 && ti.bottom <= first.top + 1;
      })(),
      fmt: (() => {
        const st = (id) => { const el = sheet.querySelector(`[data-testid=${id}]`); if (!el) return null; const cs = getComputedStyle(el); return { weight: Number(cs.fontWeight), size: parseFloat(cs.fontSize), align: cs.textAlign, style: cs.fontStyle, whiteSpace: cs.whiteSpace, lines: Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight)), fits: el.scrollWidth <= el.clientWidth + 1, width: Math.round(el.getBoundingClientRect().width) }; };
        return { header: st('honor-header'), subtitle: st('honor-subtitle'), date: st('honor-date'), titleLeft: st('honor-title-left'), titleRight: st('honor-title-right') };
      })(),
      header: text('honor-header'), subtitle: text('honor-subtitle'), date: text('honor-date'), titleLeft: text('honor-title-left'), titleRight: text('honor-title-right'),
      director: text('honor-director'), teacher: text('honor-teacher'), tie: text('honor-tie-note'), plateHeight: Math.round(plates[0]?.getBoundingClientRect().height ?? 0),
    };
  }));
  /** Clicks the real "Save as PDF" button (the save dialog answers with a file) and counts the pages of what the shell wrote. */
  let pdfNo = 0;
  const pdfPages = async () => {
    const file = path.join(outDir, `honor-e2e-${++pdfNo}.pdf`);
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('print.savePdf')).click();
    for (let i = 0; i < 60 && !existsSync(file); i++) await sleep(250);
    await sleep(300);
    const pdf = existsSync(file) ? readFileSync(file).toString('latin1') : '';
    rmSync(file, { force: true });
    return pdf.startsWith('%PDF-') ? (pdf.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length : -1;
  };
  /**
   * Lays the REAL printed text over the REAL artwork. The first sheet is taken three times: as it is, with the text made invisible (the artwork alone), and with the artwork
   * hidden (the text alone). The pixels where both are present are the places where the artwork would run through a name, a rank, a line of the header or a signature.
   * It also measures how much of the page the artwork inks and how dark its darkest strokes are (in grey: it is the lightness of each pixel). `keep` saves the picture.
   */
  const layers = async (label, keep = false) => {
    const sheetPage = page.locator('.honor-sheet .honor-page').first();
    const toasts = (hide) => page.evaluate((h) => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = h ? 'none' : ''; }), hide);
    await toasts(true);
    await page.waitForTimeout(250);
    const full = await sheetPage.screenshot();
    const hideText = await page.addStyleTag({ content: '.honor-sheet .honor-national p, .honor-sheet .honor-school p, .honor-sheet .honor-title, .honor-sheet .honor-subtitle, .honor-sheet .honor-name, .honor-sheet .honor-foot p, .honor-sheet .honor-tie-note { color: transparent !important; text-decoration: none !important; }' });
    const artOnly = await sheetPage.screenshot();
    await hideText.evaluate((el) => el.remove());
    const hideArt = await page.addStyleTag({ content: '.honor-sheet .honor-art, .honor-sheet .honor-plate-art, .honor-sheet .honor-divider { visibility: hidden !important; }' });
    const textOnly = await sheetPage.screenshot();
    await hideArt.evaluate((el) => el.remove());
    let grey = null;
    if (keep) {
      writeFileSync(path.join(outDir, `honor-e2e-style-${label}.png`), full);
      const g = await page.addStyleTag({ content: '.honor-sheet .honor-page { filter: grayscale(1) !important; }' });
      grey = await sheetPage.screenshot();
      await g.evaluate((el) => el.remove());
      writeFileSync(path.join(outDir, `honor-e2e-style-${label}-grey.png`), grey);
    }
    await toasts(false);
    const A = decodePng(artOnly);
    const B = decodePng(textOnly);
    if (A.width !== B.width || A.height !== B.height) throw new Error(`the two layers differ in size: ${A.width}x${A.height} and ${B.width}x${B.height}`);
    let overlap = 0;
    let ink = 0;
    let textPixels = 0;
    let darkest = 255;
    let where = null;
    for (let i = 0; i < A.data.length; i += 4) {
      const art = Math.min(A.data[i], A.data[i + 1], A.data[i + 2]) < 225;   // anything but white and the palest tints (a cream inside a frame is not ink)
      const text = luma(B.data, i) < 150;
      if (text) textPixels++;
      if (art) { ink++; darkest = Math.min(darkest, luma(A.data, i)); }
      if (art && text) { overlap++; where ??= `${(i / 4) % A.width},${Math.floor(i / 4 / A.width)}`; }
    }
    return { overlap, ink, textPixels, share: ink / (A.width * A.height), darkest: Math.round(darkest), where };
  };
  /**
   * The geometry of the artwork, measured on the program's own drawings (frontend/app/utils/honorArt.ts) rasterised in a hidden Chromium window:
   *  - a frame (plate, 320 x 120 units): where its ink is, and how much ink lies in the zone of the name (x = 160 +- w/2, y = cy +- 24; a Khmer name reaches 21 units, at most);
   *  - a page corner (the page is 680 x 1001 px): how far its ornament reaches in from the two edges (not counting the border lines along the edges themselves).
   */
  const measureArt = async () => {
    const art = await import(pathToFileURL(path.join(root, 'frontend', 'app', 'utils', 'honorArt.ts')).href);
    const items = art.HONOR_STYLE_IDS.map((id) => ({ id, cy: art.honorLook(id).nameBox.cy, w: art.honorLook(id).nameBox.w, plate: art.plateSvg(id).replace('width="100%" height="100%"', 'width="320" height="120"'), page: art.pageSvg(id, 680, 1001).replace('width="100%" height="100%"', 'width="680" height="1001"') }));
    const inPage = async (items) => {
      const load = (svg) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('svg did not load')); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
      const raster = async (svg, w, h) => {
        const img = await load(svg);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        return x.getImageData(0, 0, w, h).data;
      };
      const ink = (d, i) => Math.min(d[i], d[i + 1], d[i + 2]) < 225;
      const out = [];
      for (const it of items) {
        const S = 4, W = 320 * S, H = 120 * S;
        const d = await raster(it.plate, W, H);
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink(d, (y * W + x) * 4)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        let zone = 0;
        for (let y = Math.round((it.cy - 24) * S); y < Math.round((it.cy + 24) * S); y++) for (let x = Math.round((160 - it.w / 2) * S); x < Math.round((160 + it.w / 2) * S); x++) if (ink(d, (y * W + x) * 4)) zone++;
        const PW = 680, PH = 1001;
        const pd = await raster(it.page, PW, PH);
        let tlx = 0, tly = 0, brx = 0, bry = 0;
        for (let y = 0; y < 220; y++) for (let x = 0; x < 220; x++) if (x > 30 && y > 30 && ink(pd, (y * PW + x) * 4)) { tlx = Math.max(tlx, x); tly = Math.max(tly, y); }
        for (let y = PH - 220; y < PH; y++) for (let x = PW - 220; x < PW; x++) if (x < PW - 30 && y < PH - 30 && ink(pd, (y * PW + x) * 4)) { brx = Math.max(brx, PW - 1 - x); bry = Math.max(bry, PH - 1 - y); }
        out.push({ id: it.id, x0: x0 / S, x1: (x1 + 1) / S, top: y0 / S, bottom: 120 - (y1 + 1) / S, zone, reach: { x: Math.max(tlx, brx), y: Math.max(tly, bry) } });
      }
      return out;
    };
    return app.evaluate(async ({ BrowserWindow }, payload) => {
      const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { backgroundThrottling: false } });
      try {
        await win.loadURL('data:text/html,<meta charset=utf-8>');
        return await win.webContents.executeJavaScript('(' + payload.fn + ')(' + JSON.stringify(payload.items) + ')');
      } finally { win.destroy(); }
    }, { fn: inPage.toString(), items });
  };
  /** Makes the names stacked-mark Khmer (the deepest ink there is) and the signature names very long. Only the page in front of us is changed, nothing is saved. */
  const stressText = () => page.evaluate(() => {
    const names = ['4. ជ្រៀម ស្ងួត', '6. ឃ្មុំ ត្បូង', '១០. សុភ័ក្រ្ត', '2. ស្រ្តី ធ្លាក់', '3. ឈ្មោះ ក្លាហាន'];
    document.querySelectorAll('.honor-sheet .honor-name-text').forEach((el, i) => { el.textContent = names[i % names.length]; });
    const long = 'លោក ស៊ុន សុវណ្ណារី ចាន់ទីតា វិចិត្រសិរីរតនា ម៉ាលីណា ព្រះសីហនុ';
    for (const id of ['honor-director', 'honor-teacher']) { const el = document.querySelector('.honor-sheet [data-testid=' + id + ']'); if (el) el.textContent = long; }
  });
  await mainWindowCall((win) => { win.unmaximize(); win.setContentSize(1366, 1400); });   // tall enough to see a whole sheet in a picture

  // ---- 1. the Roll of honour is a PAGE of its own (not a window on the Report cards page) -------------------------------------------------------------------
  await openCards();
  await pickClass('ក');
  check('HR-1a the sidebar has "តារាងកិត្តិយស" and the Report cards page links to it (next to "print all") once a class and an examination with students are chosen',
    (await page.locator('a[href="/honor-roll"]').count()) >= 1 && (await page.locator('[data-testid=honor-roll]').isVisible()));
  await openRollPage();
  check(`HR-1b it opens a PAGE of its own, no window, already on the examination and the class chosen on the Report cards page, with 5 names, classic gold (the default) and the ${STYLES.length} artwork choices to pick from, the original ten first`,
    page.url().includes('/honor-roll') && (await page.locator('.modal.show').count()) === 0
    && (await page.locator('#honor-exam').evaluate((el) => el.selectedOptions[0]?.textContent.trim())) === EXAM && (await page.locator('select[id^="picker-class-"]').evaluate((el) => el.selectedOptions[0]?.textContent.trim().endsWith(' ក')))
    && (await page.locator('#honor-count-5').isChecked()) && !(await page.locator('#honor-count-10').isChecked()) && (await page.locator('#honor-style-classic').isChecked())
    && (await page.locator('.honor-style-card').count()) === STYLES.length && (await Promise.all(STYLES.map((s) => page.locator(`.honor-style-card[data-style=${s}]`).count()))).every((c) => c === 1), page.url());
  check('HR-1c the date starts as today and the five text boxes start with the standard wording, with the words in braces still in them (they are filled in for each page)',
    (await page.locator('#honor-date').inputValue()) === isoLocal(new Date()) && (await Promise.all(HONOR_KEYS.map((k) => page.locator(`#honor-text-${k}`).inputValue()))).join('|') === HONOR_KEYS.map((k) => STANDARD[k]).join('|'));
  check('HR-1d the page says the date drives the date words and that the program does not work out the lunar date, and that the national header is always printed, and shows the certificate beside the form',
    (await page.locator('[data-testid=honor-form]').innerText()).includes(t('honor.dateHint')) && (await page.locator('[data-testid=honor-national-hint]').isVisible()) && (await page.locator('[data-testid=honor-preview] .honor-sheet').count()) === 1);
  await shot('01-roll-page');
  await page.locator('#honor-date').fill('');
  check('HR-1e an empty or broken date cannot be opened (the button is off)', await page.locator('[data-testid=honor-open]').isDisabled());
  await page.locator('#honor-date').fill(isoLocal(new Date()));

  // ---- 2. the top 5 and the top 10 ----------------------------------------------------------------------------------------------------------------
  // (ties: the class has two students on rank 5, so a "top 5" has 6 names; see HR-4)
  await makeRoll({ count: 5, style: 'classic', date: '2026-10-31', texts: { dateLines: 'ភ្នំពេញ ត្រូវនឹង{date}' } });
  const top5 = (await measure())[0];
  const wantTop5 = ranksA.filter((r) => r.rank <= 5);
  check('HR-2a the top 5 lists exactly the students the backend ranks 1 to 5 (the same ranks as the report cards), best first',
    top5.names.length === wantTop5.length && top5.names.every((n, i) => n === `${wantTop5[i].rank}. ${wantTop5[i].name}`), top5.names.join(' | '));
  const gradeNameA = (await rest('GET', '/grades')).json[0].nameKm;
  check('HR-2b the five texts on the sheet with their words filled in: the school and the class, the subtitle with the examination, the date line with the place and the chosen date, both signature titles, the teacher and the director',
    top5.header === `${SCHOOL}\n${gradeNameA} ក` && top5.subtitle === `លទ្ធផល${EXAM}` && top5.date.startsWith('ភ្នំពេញ ត្រូវនឹងថ្ងៃទី') && top5.date.includes('31') && top5.date.includes('2026')
    && top5.titleRight === STANDARD.titleRight && top5.titleLeft === STANDARD.titleLeft && top5.director === DIRECTOR && top5.teacher === TEACHER, JSON.stringify({ h: top5.header, s: top5.subtitle, d: top5.date, r: top5.titleRight, l: top5.titleLeft }));
  check('HR-2c the national header is already there, with its two standard lines in the title font, although the settings switch for the other printed pages is off (its default)',
    top5.national === 2 && top5.nationalText.join(' / ') === 'ព្រះរាជាណាចក្រកម្ពុជា / ជាតិ សាសនា ព្រះមហាក្សត្រ' && top5.nationalFont.includes('Moul') && top5.headOrder,
    `${top5.nationalText.join(' / ')} · ${top5.nationalFont.split(',')[0]} · order ${top5.headOrder}`);
  check('HR-2d one A4 page: the page is the printable area (180 x 265 mm), nothing runs past it, every frame is inside it', top5.pageWidth === 680 && top5.pageHeight >= 1000 && top5.pageHeight <= 1009 && top5.contentFits && top5.platesInsidePage && top5.platesInsideRowsArea, JSON.stringify({ w: top5.pageWidth, h: top5.pageHeight }));
  check('HR-2e the toolbar says one sheet', (await page.locator('[data-testid=honor-count]').innerText()).includes(t('honor.sheetCount').replace('{count}', '1')));
  check('HR-2f the real "Save as PDF" is exactly one A4 page', (await pdfPages()) === 1);
  await shot('02-top5-with-ties');
  await back();

  // a roll without ties: class ខ has two ranked students
  await pickClass('ខ');
  await makeRoll({ count: 10, style: 'laurel' });
  const small = (await measure())[0];
  check('HR-2g a short class gives a short list and no empty frames: 2 names, rows 1,1', small.names.length === 2 && small.rows.join(',') === '1,1' && small.names[0].endsWith('អ៊ុក ពិសី') && small.names[1].endsWith('សៀង ដាលីន'), small.names.join(' | '));
  await back();
  await pickClass('ក');

  await makeRoll({ count: 10, style: 'classic', date: '2026-10-31' });
  const top10 = (await measure())[0];
  const wantTop10 = ranksA.filter((r) => r.rank <= 10);
  check('HR-2h the top 10: the students ranked 1 to 10, best first (the tie on rank 5 is kept)', top10.names.length === wantTop10.length && top10.names.every((n, i) => n === `${wantTop10[i].rank}. ${wantTop10[i].name}`), top10.names.join(' | '));
  check('HR-2i the layout of ten names: 1,2,2,2,2,1 (the first alone on top, pairs, the last alone)', top10.rows.join(',') === '1,2,2,2,2,1', top10.rows.join(','));
  check('HR-2j ten names fit one A4 page, and the real PDF is one page', top10.contentFits && top10.platesInsidePage && top10.platesInsideRowsArea && top10.pageHeight <= 1009 && (await pdfPages()) === 1);
  await shot('03-top10');
  await back();

  // ---- 3. ties and the incomplete result ---------------------------------------------------------------------------------------------------------
  await makeRoll({ count: 5, style: 'classic' });
  const tie = (await measure())[0];
  check('HR-4a a top 5 whose last rank is shared by two students lists both: six names with ranks 1,2,3,4,5,5 (the student on rank 7 is not on it)',
    tie.ranks.join(',') === '1,2,3,4,5,5', tie.ranks.join(','));
  check('HR-4b ...so the rows follow the number of names (1,2,2,1), and the sheet says that a tie made the list longer than 5',
    tie.rows.join(',') === '1,2,2,1' && !!tie.tie && tie.tie.includes('5'), `${tie.rows.join(',')} / ${tie.tie}`);
  check('HR-4c the student with a missing mark is not on any roll (not even as the last name)', !tie.names.concat(top10.names).some((n) => n.includes(INCOMPLETE)));
  check('HR-4d a ten-name roll has no tie note when the last rank is not shared', top10.tie === null);
  await shot('04-ties');
  await back();

  // ---- 4. a long name, and the optional lines ---------------------------------------------------------------------------------------------------
  await makeRoll({ count: 10, style: 'angkor', date: '2026-10-31', texts: { header: 'ការិយាល័យអប់រំ យុវជន និងកីឡា ស្រុកគំរូ\n{school}\n{class}', dateLines: 'ថ្ងៃសុក្រ ២រោច ខែទុតិយាសាឍ ឆ្នាំមមី សប្តស័ក ពស ២៥៧០\nភ្នំពេញ ត្រូវនឹង{date}' } });
  const long = (await measure())[0];
  check('HR-5a the very long name (rank 3) is on the sheet in full and has shrunk to stay inside its frame; no name leaves its frame',
    long.names.some((n) => n.includes(LONG_NAME)) && long.shrunk >= 1 && long.namesInsideFrames && long.namesFit, `shrunk ${long.shrunk}`);
  check('HR-5b a line typed above the school and the lunar-date line typed above the date each print on their own line (the school wrote "ត្រូវនឹង" itself), and the page still fits',
    long.header === `ការិយាល័យអប់រំ យុវជន និងកីឡា ស្រុកគំរូ\n${SCHOOL}\n${gradeNameA} ក` && long.date.split('\n').length === 2 && long.date.includes('សប្តស័ក') && long.date.split('\n')[1].startsWith('ភ្នំពេញ ត្រូវនឹងថ្ងៃទី') && long.contentFits && long.platesInsidePage);
  check('HR-5c the long lunar date ("ថ្ងៃសុក្រ ២រោច ខែទុតិយាសាឍ ឆ្នាំមមី សប្តស័ក ពស ២៥៧០") stays on ONE line (the date lines are 2 lines in all, not 3): the date column is wide (at least 320 px) and the line shrinks only if it must',
    long.fmt.date.lines === 2 && long.fmt.date.fits && long.fmt.date.width >= 320, JSON.stringify(long.fmt.date));
  await shot('05-optional-lines');
  await back();

  // ---- 5. every style, at 5 and at 10 names -------------------------------------------------------------------------------------------------------
  const styleResults = [];
  const layerResults = [];
  for (const count of [5, 10]) {
    for (const style of STYLES) {
      await makeRoll({ count, style, date: '2026-10-31', texts: { dateLines: 'ភ្នំពេញ ត្រូវនឹង{date}' } });
      const m = (await measure())[0];
      layerResults.push({ style, count, ...(await layers(`${style}-${count}`, NEW_STYLES.includes(style) || ['classic', 'mono'].includes(style))) });
      const pages = await pdfPages();
      const stress = NEW_STYLES.includes(style) ? (await stressText(), await layers(`stress-${style}-${count}`)) : null;
      if (stress) layerResults.at(-1).stress = stress;
      styleResults.push({ style, count, ok: m.style === style && m.national === 2 && m.nationalText[0] === 'ព្រះរាជាណាចក្រកម្ពុជា' && m.nationalText[1] === 'ជាតិ សាសនា ព្រះមហាក្សត្រ' && m.headOrder && m.contentFits && m.platesInsidePage && m.platesInsideRowsArea && m.namesInsideFrames && m.pageHeight <= 1009 && pages === 1 && m.names.length === (count === 5 ? 6 : 10), pages, plate: m.plateHeight });
      await back();
    }
  }
  const bad = styleResults.filter((r) => !r.ok);
  check(`HR-6 all ${STYLES.length} styles x {5, 10} names (${styleResults.length} sheets): each has the national header and its flourish at the top and fits one page (measured), and its real PDF is exactly one A4 page; frames are ${Math.min(...styleResults.map((r) => r.plate))} to ${Math.max(...styleResults.map((r) => r.plate))} px high`,
    bad.length === 0, bad.map((r) => `${r.style}/${r.count}: pdf ${r.pages}`).join('; '));
  // the artwork never runs through a name, a rank or any other printed line: the real text laid over the real artwork, pixel by pixel (the "star" style prints its names in white
  // ON its navy plate by design, so its names are not part of this count)
  const noText = layerResults.filter((r) => r.textPixels < 2000 && r.style !== 'star');
  const noInk = layerResults.filter((r) => r.ink < 500);
  check(`HR-6b the real printed text and the real artwork never touch, in all ${NEW_STYLES.length} new styles x {5, 10} names (${NEW_STYLES.length * 2} sheets): 0 pixels shared between the artwork and any name, rank, header line, title or signature (both layers were really captured: text pixels at least ${Math.min(...layerResults.filter((r) => r.style !== 'star').map((r) => r.textPixels))}, artwork pixels at least ${Math.min(...layerResults.map((r) => r.ink))})`,
    layerResults.filter((r) => NEW_STYLES.includes(r.style)).every((r) => r.overlap === 0) && noText.length === 0 && noInk.length === 0,
    layerResults.filter((r) => NEW_STYLES.includes(r.style) && r.overlap > 0).map((r) => `${r.style}/${r.count}: ${r.overlap} px at ${r.where}`).join('; '));
  const originalsTouching = layerResults.filter((r) => ORIGINAL_STYLES.includes(r.style) && r.style !== 'star' && r.overlap > 0);
  check(`HR-6c the same count for the ten ORIGINAL styles (they are not changed; this only reports): ${originalsTouching.length === 0 ? 'none of them touches any text either' : 'they touch the text at ' + originalsTouching.map((r) => `${r.style}/${r.count}: ${r.overlap} px`).join(', ')}`, true);
  const share = (style, count) => layerResults.find((r) => r.style === style && r.count === count);
  const lightOk = [5, 10].every((count) => ['vintage', 'modern'].every((id) => share(id, count).share <= Math.max(0.03, share('mono', count).share * 1.5) && share(id, count).darkest <= 110));
  check(`HR-6d the two light-ink styles use little ink and print dark enough in grey: ink share vintage ${[5, 10].map((c) => (share('vintage', c).share * 100).toFixed(2)).join('/')} %, modern ${[5, 10].map((c) => (share('modern', c).share * 100).toFixed(2)).join('/')} %, the simple-line style (the existing light one) ${[5, 10].map((c) => (share('mono', c).share * 100).toFixed(2)).join('/')} %, the classic gold ${[5, 10].map((c) => (share('classic', c).share * 100).toFixed(2)).join('/')} % (for 5 / 10 names); darkest stroke at lightness ${share('vintage', 5).darkest} and ${share('modern', 5).darkest} of 255 (0 = black)`, lightOk);
  check(`HR-6f STRESS: names with stacked marks (ជ្រៀម ស្ងួត, ឃ្មុំ ត្បូង, សុភ័ក្រ្ត ...) and very long names of the director and the class teacher laid over the artwork of the ${NEW_STYLES.length} new styles x {5, 10} names: 0 shared pixels (both layers captured)`,
    layerResults.filter((r) => r.stress).length === NEW_STYLES.length * 2 && layerResults.filter((r) => r.stress).every((r) => r.stress.overlap === 0 && r.stress.textPixels > 2000),
    layerResults.filter((r) => r.stress && r.stress.overlap > 0).map((r) => `${r.style}/${r.count}: ${r.stress.overlap} px at ${r.stress.where}`).join('; '));
  const art = await measureArt();
  const newArt = art.filter((a) => NEW_STYLES.includes(a.id));
  const geomBad = newArt.filter((a) => a.zone !== 0 || a.x0 < 4 || a.x1 > 316 || a.top + a.bottom < 9.6 || a.top < 4 || a.bottom < 4 || a.reach.x > 86 || a.reach.y > 50);
  check(`HR-6e geometry of the ${NEW_STYLES.length} new styles, measured on their drawings: nothing inked within 24 units of the middle of a name (0 pixels), the ink of a frame inside x 4 to 316 and with at least 9.6 units free above and below together (the rows of frames overlap by that much), a page corner reaches at most 86 px along an edge and 50 px inward (the signatures end 53 px above the foot of the page, the corner begins 47 px above it); widest corner ${Math.max(...newArt.map((a) => a.reach.x))} x ${Math.max(...newArt.map((a) => a.reach.y))} px`,
    geomBad.length === 0, geomBad.map((a) => `${a.id}: zone ${a.zone}, x ${a.x0}-${a.x1}, free ${a.top}+${a.bottom}, corner ${a.reach.x}x${a.reach.y}`).join('; '));
  const oldArt = art.filter((a) => ORIGINAL_STYLES.includes(a.id));
  check(`HR-6g the same measures for the ten ORIGINAL styles (not changed; this only reports): ink inside the 24-unit zone of a name in ${oldArt.filter((a) => a.zone > 0).map((a) => a.id).join(', ') || 'none'}; widest corner ${Math.max(...oldArt.map((a) => a.reach.x))} x ${Math.max(...oldArt.map((a) => a.reach.y))} px`, true);

  // ---- 6. every class of the year ------------------------------------------------------------------------------------------------------------------
  await makeRoll({ count: 5, style: 'lotus', all: true });
  const all = await measure();
  check('HR-7a "every class of the year": one sheet for each class that has someone ranked (ក and ខ), in class order, each with its own class label and teacher',
    all.length === 2 && all[0].header.endsWith(' ក') && all[1].header.endsWith(' ខ') && all[0].teacher === TEACHER && all[1].teacher === '' && all.every((s) => s.style === 'lotus'), all.map((s) => s.header.replace('\n', ' / ')).join(' | '));
  check('HR-7b the class with nobody ranked (គ) gets no sheet and is named on the screen, not on paper',
    (await page.locator('[data-testid=honor-skipped]').innerText()).includes('គ') && (await page.locator('[data-testid=honor-skipped]').evaluate((e) => e.classList.contains('no-print'))));
  check('HR-7c every sheet of "every class" carries the national header, and the real PDF has one A4 page per sheet (2 pages)', all.every((x) => x.national === 2 && x.headOrder) && (await pdfPages()) === 2);
  await back();
  await pickClass('គ');
  await makeRoll({ count: 5 });
  const nothing = { message: await page.locator('[data-testid=honor-none]').isVisible(), printOff: await button(t('print.print')).isDisabled(), sheets: await sheets().count() };
  check('HR-7d for a class with nobody ranked the roll can still be opened (its cards exist), but it says there is nothing to print: no sheet, Print is off',
    nothing.message && nothing.printOff && nothing.sheets === 0, JSON.stringify(nothing));
  await back();
  await pickClass('ក');

  // ---- 7. the ONE saved default: the five texts of the school's sample (and how each looks) are set once, then printing only means choosing the DATE ------------------
  await page.locator('[data-testid=honor-def-reset]').click();
  const defBox = (key) => page.locator(`#honor-text-${key}`);
  check('HR-8a the page has the five boxes with the standard wording, the six words to click, a font toolbar on every box, and "Save as the default" is off while nothing differs from the saved default',
    (await Promise.all(HONOR_KEYS.map((k) => defBox(k).inputValue()))).join('|') === HONOR_KEYS.map((k) => STANDARD[k]).join('|') && (await page.locator('.honor-token').count()) === 6
    && (await page.locator('[data-fmt$="-bold"]').count()) === 5 && (await page.locator('[data-fmt$="-size"]').count()) === 5 && (await page.locator('[data-testid=honor-def-save]').isDisabled()));
  const SAVED = {
    header: 'កម្រងសាលាលេខ២\n{school}\n{class}', subtitle: 'លទ្ធផលប្រចាំខែ{month} {year}', dateLines: 'ថ្ងៃសុក្រ  ២រោច\nបាណន់ ត្រូវនឹង{date}', titleRight: 'គ្រូបន្ទុកថ្នាក់', titleLeft: 'បានឃើញ និងឯកភាព\nនាយកសាលា',
  };
  await page.locator('#honor-count-10').check();
  await page.locator('label[for="honor-style-laurel"]').click();
  await defBox('header').fill(SAVED.header);
  await defBox('subtitle').fill('លទ្ធផលប្រចាំខែ{month} ');
  await page.locator('.honor-token[data-token=year]').click();   // a click puts the word where the cursor was
  check('HR-8b clicking a word ({year}) inserts it at the cursor of the box that was being typed in', (await defBox('subtitle').inputValue()) === SAVED.subtitle, await defBox('subtitle').inputValue());
  await defBox('dateLines').fill(SAVED.dateLines);
  await defBox('titleRight').fill(SAVED.titleRight);
  await defBox('titleLeft').fill(SAVED.titleLeft);
  // the font toolbar of a box (like a small text editor): the subtitle bold, the date lines small, the left title right-aligned and italic
  await page.locator('[data-fmt="subtitle-bold"]').click();
  await page.selectOption('[data-fmt="dateLines-size"]', 'S');
  await page.locator('[data-fmt="titleLeft-align-right"]').click();
  await page.locator('[data-fmt="titleLeft-italic"]').click();
  const pv = await page.evaluate(() => {
    const s = document.querySelector('[data-testid=honor-preview] .honor-sheet');
    const text = (id) => s.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
    const st = (id) => { const cs = getComputedStyle(s.querySelector(`[data-testid=${id}]`)); return { weight: Number(cs.fontWeight), size: parseFloat(cs.fontSize), align: cs.textAlign, style: cs.fontStyle }; };
    return { names: s.querySelectorAll('[data-testid=honor-plate]').length, style: s.getAttribute('data-style'), header: text('honor-header'), subtitle: text('honor-subtitle'), date: text('honor-date'), titleLeft: text('honor-title-left'), titleRight: text('honor-title-right'),
      fmt: { subtitle: st('honor-subtitle'), date: st('honor-date'), left: st('honor-title-left'), right: st('honor-title-right') } };
  });
  check('HR-8c the preview follows the form at once: ten sample names, the laurel style, every red-box text with its words filled in (the real school, the chosen class and examination, today\'s month and year and date), and the typed spaces and line breaks kept',
    pv.names === 10 && pv.style === 'laurel' && pv.header === `កម្រងសាលាលេខ២\n${SCHOOL}\nថ្នាក់ទី១ ក` && /^លទ្ធផលប្រចាំខែ\S+ \d{4}$/.test(pv.subtitle) && pv.date.startsWith('ថ្ងៃសុក្រ  ២រោច\nបាណន់ ត្រូវនឹងថ្ងៃទី')
    && pv.titleRight === SAVED.titleRight && pv.titleLeft === SAVED.titleLeft, JSON.stringify({ h: pv.header, s: pv.subtitle, d: pv.date }));
  check('HR-8d the toolbar changes how each box prints, in the preview at once: the subtitle bold, the date lines small (0.85 of the other boxes), the left title right-aligned and italic; the right title is untouched (still bold, as on the school\'s sample, and centred)',
    pv.fmt.subtitle.weight >= 700 && Math.abs(pv.fmt.date.size / pv.fmt.right.size - 0.85) < 0.03 && pv.fmt.left.align === 'right' && pv.fmt.left.style === 'italic' && pv.fmt.right.align === 'center' && pv.fmt.right.style === 'normal' && pv.fmt.right.weight >= 700, JSON.stringify(pv.fmt));
  await shot('07-roll-page-set');
  await defBox('header').fill('1\n2\n3\n4\n5');
  check('HR-8e a fifth line is refused next to the box and "Save as the default" is off (nothing is cut silently)',
    (await page.locator('.invalid-feedback', { hasText: t('honor.defaults.tooManyLines').replace('{lines}', '4') }).count()) === 1 && (await page.locator('[data-testid=honor-def-save]').isDisabled()));
  await defBox('header').fill(SAVED.header);
  await page.locator('[data-testid=honor-def-save]').click();
  await page.locator('.toast', { hasText: t('honor.defaults.saved') }).first().waitFor({ timeout: 15_000 });
  check('HR-8f once saved, nothing differs from the saved default any more', (await page.locator('[data-testid=honor-differs]').count()) === 0 && (await page.locator('[data-testid=honor-def-save]').isDisabled()));

  // the next time: from the Report cards page the page starts from the saved default, so only the date is left to choose
  await openCards();
  await pickClass('ក');
  await openRollPage();
  const winTexts = await Promise.all(HONOR_KEYS.map((k) => defBox(k).inputValue()));
  check('HR-8g the page now starts from the saved default: 10 names, laurel, all five texts as saved (the words in braces still in them), their font toolbars as saved, and today\'s date',
    (await page.locator('#honor-count-10').isChecked()) && (await page.locator('#honor-style-laurel').isChecked()) && winTexts.join('|') === HONOR_KEYS.map((k) => SAVED[k]).join('|')
    && (await page.locator('[data-fmt="subtitle-bold"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('[data-fmt="dateLines-size"]').inputValue()) === 'S'
    && (await page.locator('[data-fmt="titleLeft-align-right"]').getAttribute('aria-pressed')) === 'true' && (await page.locator('#honor-date').inputValue()) === isoLocal(new Date()), JSON.stringify(winTexts));
  await shot('08-roll-page-from-defaults');
  await page.locator('#honor-date').fill('2026-11-30');   // the ONLY thing changed
  check('HR-8h the page shows the chosen date in words at once', (await page.locator('[data-testid=honor-date-long]').innerText()).includes('30') && (await page.locator('[data-testid=honor-date-long]').innerText()).includes('វិច្ឆិកា'));
  await page.locator('[data-testid=honor-open]').click();
  await page.waitForFunction(() => document.querySelectorAll('.honor-sheet [data-testid=honor-plate]').length > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  const defaulted = (await measure())[0];
  const gradeName = (await rest('GET', '/grades')).json[0].nameKm;
  check('HR-8i changing only the date prints the whole saved certificate with the date filled in: the extra line, the school and this class on the top left; the month and the year in the subtitle; the date in the date lines; both titles; the national header on top; one A4 page',
    defaulted.style === 'laurel' && defaulted.names.length === 10 && defaulted.rows.join(',') === '1,2,2,2,2,1' && defaulted.header === `កម្រងសាលាលេខ២\n${SCHOOL}\n${gradeName} ក` && defaulted.subtitle === 'លទ្ធផលប្រចាំខែវិច្ឆិកា 2026'
    && defaulted.date === 'ថ្ងៃសុក្រ  ២រោច\nបាណន់ ត្រូវនឹងថ្ងៃទី30 ខែវិច្ឆិកា ឆ្នាំ2026' && defaulted.titleRight === 'គ្រូបន្ទុកថ្នាក់' && defaulted.titleLeft === 'បានឃើញ និងឯកភាព\nនាយកសាលា' && defaulted.director === DIRECTOR && defaulted.teacher === TEACHER
    && defaulted.national === 2 && defaulted.headOrder && defaulted.contentFits && defaulted.platesInsidePage && (await pdfPages()) === 1, JSON.stringify({ h: defaulted.header, s: defaulted.subtitle, d: defaulted.date }));
  const f = defaulted.fmt;
  check('HR-8j the spaces, line breaks AND the font style set in the page are on the printed paper: header and left title keep "pre-wrap" and 3 and 2 lines, the date lines stay on one line each (2 lines), the subtitle is bold, the left title is right-aligned and italic',
    f.header.whiteSpace === 'pre-wrap' && f.header.lines >= 3 && f.titleLeft.whiteSpace === 'pre-wrap' && f.titleLeft.lines >= 2 && f.date.whiteSpace === 'pre' && f.date.lines === 2 && f.subtitle.weight >= 700 && f.titleLeft.align === 'right' && f.titleLeft.style === 'italic'
    && f.titleRight.align === 'center', JSON.stringify(f));
  await shot('09-printed-from-defaults');

  // THE RETURN: Back from the preview comes back to the roll of honour page itself (not to the list of students), with everything that was chosen
  await back();
  check('HR-8k Back from the preview returns to the roll of honour page with everything as it was: the same examination and class, the date 30 November, 10 names, laurel, all five texts and their font style',
    page.url().includes('/honor-roll') && (await page.locator('#honor-exam').evaluate((el) => el.selectedOptions[0]?.textContent.trim())) === EXAM && (await page.locator('select[id^="picker-class-"]').evaluate((el) => el.selectedOptions[0]?.textContent.trim().endsWith(' ក')))
    && (await page.locator('#honor-date').inputValue()) === '2026-11-30' && (await page.locator('#honor-count-10').isChecked()) && (await page.locator('#honor-style-laurel').isChecked())
    && (await Promise.all(HONOR_KEYS.map((k) => defBox(k).inputValue()))).join('|') === HONOR_KEYS.map((k) => SAVED[k]).join('|') && (await page.locator('[data-fmt="subtitle-bold"]').getAttribute('aria-pressed')) === 'true', page.url());

  // another date, and nothing else: the month, the year and the date lines follow it by themselves
  await page.locator('#honor-date').fill('2026-12-05');
  await page.locator('[data-testid=honor-open]').click();
  await page.waitForFunction(() => document.querySelectorAll('.honor-sheet [data-testid=honor-plate]').length > 0, null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  const december = (await measure())[0];
  check('HR-8l choosing another date (5 December) and nothing else changes the month and the date lines by themselves: "ប្រចាំខែធ្នូ 2026" and "បាណន់ ត្រូវនឹងថ្ងៃទី5 ខែធ្នូ ឆ្នាំ2026"',
    december.subtitle === 'លទ្ធផលប្រចាំខែធ្នូ 2026' && december.date === 'ថ្ងៃសុក្រ  ២រោច\nបាណន់ ត្រូវនឹងថ្ងៃទី5 ខែធ្នូ ឆ្នាំ2026', JSON.stringify({ s: december.subtitle, d: december.date }));
  await back();

  // the national header ships with two lines; a third makes the worst case worse
  must(await rest('PUT', '/settings/app', { 'report.moeysHeader': 'true', 'report.khmerNumerals': 'true', 'report.headerLine3': 'សាលាបឋមសិក្សាសាធារណៈ ភូមិថ្មី' }), 'settings');
  await page.locator('.user-menu-toggle').click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: t('nav.signOut') }).first().click();
  await field('username').waitFor({ timeout: 20_000 });
  await field('username').fill('admin.sokha');
  await field('password').fill(PW);
  await button(t('auth.login.submit')).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await page.locator('[data-testid=dashboard-figures]').waitFor({ timeout: 30_000 });
  await openCards();
  await pickClass('ក');
  await openRollPage();
  const afterSignIn = await Promise.all(HONOR_KEYS.map((k) => defBox(k).inputValue()));
  check('HR-8m after signing out and in the saved default is still there (10 names, laurel, all five texts, the bold subtitle): it is kept in the program, not in memory',
    (await page.locator('#honor-count-10').isChecked()) && (await page.locator('#honor-style-laurel').isChecked()) && afterSignIn.join('|') === HONOR_KEYS.map((k) => SAVED[k]).join('|') && (await page.locator('[data-fmt="subtitle-bold"]').getAttribute('aria-pressed')) === 'true');

  // the worst case: the national header (3 lines), a long office line, the lunar date, a place, ten names with the long one, Khmer digits
  const longOffice = 'ការិយាល័យអប់រំ យុវជន និងកីឡា ស្រុកគំរូ ខេត្តគំរូ សាលាបឋមសិក្សា ភូមិថ្មី ឃុំគំរូ ស្រុកគំរូ';
  const worstAll = [];
  for (const style of STYLES) {
    await makeRoll({ count: 10, style, date: '2026-10-31', texts: { header: `${longOffice}\n{school}\n{class}`, dateLines: 'ថ្ងៃសុក្រ ២រោច ខែទុតិយាសាឍ ឆ្នាំមមី សប្តស័ក ពស ២៥៧០\nភ្នំពេញ ត្រូវនឹង{date}' } });
    const worst = (await measure())[0];
    const pages = await pdfPages();
    worstAll.push({ style, ok: worst.national === 3 && worst.contentFits && worst.platesInsidePage && worst.platesInsideRowsArea && worst.namesInsideFrames && worst.pageHeight <= 1009 && pages === 1, pages, plate: worst.plateHeight, ...(NEW_STYLES.includes(style) ? await layers(`worst-${style}`) : {}) });
    if (['classic', 'royal', 'kids'].includes(style)) check(`HR-9 WORST CASE (${style}): the national header (3 lines), a long office line, the lunar date, a place and ten names with a very long one still fit one A4 page (frames ${worst.plateHeight} px high) and the PDF is one page`,
      worst.national === 3 && worst.contentFits && worst.platesInsidePage && worst.platesInsideRowsArea && worst.namesInsideFrames && worst.pageHeight <= 1009 && pages === 1, JSON.stringify({ national: worst.national, fits: worst.contentFits, pages, plate: worst.plateHeight }));
    if (style === 'classic') {
      const digits = await page.locator('.honor-sheet').first().evaluate((s) => ({ plates: [...s.querySelectorAll('[data-testid=honor-name]')].map((n) => n.textContent), date: s.querySelector('[data-testid=honor-date]').textContent }));
      check('HR-9b with Khmer digits switched on, the ranks and the date are in Khmer digits (១. ២. ... ១០.) and no Arabic digit is left on the sheet',
        digits.plates[0].trim().startsWith('១.') && digits.plates.at(-1).trim().startsWith('១០.') && !/[0-9]/.test(await page.locator('.honor-sheet').first().innerText()), digits.plates.slice(0, 2).join(' | ') + ' / ' + digits.date);
      await shot('06-worst-case');
    }
    await back();
  }
  check(`HR-9c WORST CASE, all ${STYLES.length} styles: the national header (3 lines), a long office line, the lunar date, a place and ten names with a very long one, in Khmer digits: every sheet fits one A4 page and one PDF page; in the ${NEW_STYLES.length} new styles the artwork shares 0 pixels with any printed line`,
    worstAll.every((r) => r.ok) && worstAll.filter((r) => NEW_STYLES.includes(r.style)).every((r) => r.overlap === 0 && r.textPixels > 2000),
    worstAll.filter((r) => !r.ok || r.overlap > 0).map((r) => `${r.style}: ok ${r.ok}, pages ${r.pages}, touching ${r.overlap ?? '-'} px at ${r.where ?? '-'}`).join('; '));

  // ---- 8. nothing stored in the browser, no CSP violation, no console error, local origins only ------------------------------------------------------
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }));
  check('HR-10a the program stores nothing in the browser (localStorage, sessionStorage, cookies are empty)', stored.local === 0 && stored.session === 0 && stored.cookies === '', JSON.stringify(stored));
  const csp = await page.evaluate(() => window.__csp);
  check('HR-10b no CSP violation, no console error, and only app://school and the local backend were contacted', csp.length === 0 && consoleErrors.length === 0 && [...origins].every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)),
    [...csp, ...consoleErrors, ...[...origins].filter((o) => o !== 'app://school' && !/^http:\/\/127\.0\.0\.1:\d+$/.test(o))].slice(0, 3).join(' | '));

  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('HR-11 quitting stops the app and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { const p = app?.windows().find((w) => w.url().startsWith('app://school')); if (p) await p.screenshot({ path: path.join(outDir, 'honor-e2e-FAIL.png') }); } catch { /* ignore */ }
} finally {
  try { if (app) await app.close(); } catch { /* ignore */ }
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${root}\\\\node_modules\\\\*' } | Stop-Process -Force`], { stdio: 'ignore' }); } catch { /* ignore */ }
  await sleep(500);
  try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
