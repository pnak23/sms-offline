// The REAL Nuxt UI inside the REAL Electron shell and backend (unpackaged: desktop/dist + frontend/.output/public).
// Proves the Electron-specific layer the browser walkthrough (frontend/e2e) cannot: strict CSP, app:// serving, header injection,
// the real preload, real PDF output, offline-only network traffic. Needs: npm run generate -w frontend && npm run build -w desktop.
// Usage: node desktop/test/e2e-app.mjs
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..', '..');
const desktop = path.join(root, 'desktop');
const outDir = path.join(desktop, 'test', 'out');
mkdirSync(outDir, { recursive: true });
const km = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const t = (key) => { const v = key.split('.').reduce((n, p) => n?.[p], km); if (typeof v !== 'string') throw new Error(`km.json key missing: ${key}`); return v; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };

const data = mkdtempSync(path.join(tmpdir(), 'sms app ទិន្នន័យ '));
const env = { ...process.env, SMS_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
const PW = 'Khmer-School-Pass-2026';
const SCHOOL = 'សាលាបឋមសិក្សា ភូមិថ្មី';
let app, page;
const consoleErrors = [];
const requests = new Set();

const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
const button = (text) => page.getByRole('button', { name: text, exact: true });
const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
async function shot(name) {
  // Toasts of earlier steps pile up over the page because the test acts faster than a person; hide them for the picture only.
  const setToasts = (display) => page.evaluate((v) => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = v; }), display);
  await setToasts('none');
  await page.screenshot({ path: path.join(outDir, `app-${name}.png`) });
  await setToasts('');
}
const scrollTop = () => page.evaluate(() => { for (const el of document.querySelectorAll('main, .app-content, body, html')) el.scrollTop = 0; });

try {
  app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop], env, timeout: 120_000 });
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('main window did not appear');
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 4(01|22|29)\b/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });   // 401/422/429 are the deliberate wrong-password steps
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('request', (r) => {   // Node reports origin "null" for non-special schemes like app:, so build it by hand
    if (/^(data|blob):/.test(r.url())) return;
    const u = new URL(r.url());
    requests.add(u.protocol + '//' + u.host);
  });
  // record CSP violations from the very first script of every (re)load
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // ---- 1. the app boots under the strict CSP and starts the wizard ----
  await heading(t('setup.welcome.checksTitle')).waitFor({ timeout: 60_000 });
  await page.locator('.health-row').first().waitFor();
  const boot = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      url: location.href, lang: document.documentElement.lang,
      loadedFaces: [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')))],
      khmerFont: document.fonts.check('16px "Noto Sans Khmer"'),
      bodyFont: getComputedStyle(document.body).fontFamily,
      csp: window.__csp, desktop: Object.keys(window.desktop ?? {}).length,
    };
  });
  check('1a the real UI boots from app://school/ and shows the setup wizard (fresh install)', boot.url === 'app://school/setup' || boot.url.startsWith('app://school/'), boot.url);
  check('1b NO Content-Security-Policy violation while loading (script hash, fonts, styles, images, connect)', boot.csp.length === 0, boot.csp.join(' | '));
  check('1c the bundled Noto Sans Khmer font files load under CSP (font-src self)', boot.loadedFaces.some((f) => f.includes('Noto Sans Khmer')), boot.loadedFaces.join(', '));
  check('1d the real preload is present before the app starts (window.desktop)', boot.desktop >= 10, `${boot.desktop} functions`);
  const rows = await page.locator('.health-row').allInnerTexts();
  console.log(`      step 1 health rows: ${rows.length}`);
  check('1e wizard step 1 shows the live health checks from the backend (via the injected secret)', rows.length >= 8, rows.map((r) => r.replace(/\s+/g, ' ').slice(0, 40)).slice(0, 3).join(' | '));
  await shot('01-welcome');

  // ---- 2. administrator + recovery key ----
  await button(t('common.next')).click();
  await field('displayName').fill('អ្នកគ្រប់គ្រង សុខា');
  await field('username').fill('admin.sokha');
  await field('password').fill(PW);
  await field('confirmPassword').fill(PW);
  await button(t('setup.admin.create')).click();
  await page.locator('.recovery-key-block').waitFor({ timeout: 30_000 });
  const key = (await page.locator('.recovery-key-block .recovery-key-group').allInnerTexts()).join('-');
  check('2a the administrator is created through the real backend; the recovery key is shown', /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/.test(key), key.replace(/./g, (c, i) => (i < 5 ? c : '•')));
  await shot('02-recovery-key');

  // ---- 3. print page + REAL printToPDF through the preload ----
  await button(t('recovery.printOrPdf')).click();
  await page.locator('.key-sheet-key').waitFor();
  const sheetKey = (await page.locator('.key-sheet-key span').allInnerTexts()).join('-');
  check('3a the print sheet shows the same key (held in memory, not in the URL)', sheetKey === key && !page.url().includes(key.slice(0, 5)), page.url());
  const pdfPath = path.join(outDir, 'app-recovery-key.pdf');
  rmSync(pdfPath, { force: true });
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, pdfPath);
  await shot('03-print-page');
  await button(t('print.savePdf')).click();
  for (let i = 0; i < 40 && !existsSync(pdfPath); i++) await sleep(250);
  const pdf = existsSync(pdfPath) ? readFileSync(pdfPath) : Buffer.alloc(0);
  check('3b "Save as PDF" in the real UI produces a PDF through the shell', pdf.subarray(0, 5).toString() === '%PDF-', `${pdf.length} bytes`);
  await page.getByRole('button', { name: t('common.back') }).first().click().catch(() => page.goBack());

  // ---- 4. confirm the key and finish the wizard ----
  await page.locator('.recovery-key-block').waitFor();
  check('4a returning from the print page still shows the key (no re-generation)', (await page.locator('.recovery-key-block .recovery-key-group').allInnerTexts()).join('-') === key);
  await page.locator('#recovery-saved').check();
  await page.locator('#recovery-retype').fill(key.split('-')[0].toLowerCase());
  await button(t('recovery.continue')).click();
  await page.locator('#field-nameKm-input, input[id^="field-nameKm-"]').first().waitFor({ timeout: 30_000 }).catch(async () => { await shot('FAIL-after-key'); throw new Error('wizard step 4 did not appear after confirming the key'); });
  await field('nameKm').fill(SCHOOL);
  await button(t('common.saveAndContinue')).click();
  await page.waitForTimeout(800);
  const skipOrNext = async () => { for (const label of [t('common.skipForNow'), t('common.saveAndContinue'), t('common.next')]) { const b = button(label); if (await b.count() && await b.isEnabled().catch(() => false)) { await b.click(); return label; } } return null; };
  for (let i = 0; i < 4 && !(await button(t('setup.finish.start')).count()); i++) { await skipOrNext(); await page.waitForTimeout(700); }
  await button(t('setup.finish.start')).click();
  await page.locator('.app-content, main').first().waitFor({ timeout: 30_000 });
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  check('4b the wizard completes and lands on the dashboard', page.url().endsWith('/dashboard'), page.url());
  await page.locator('.header-school-name').filter({ hasText: SCHOOL }).waitFor({ timeout: 15_000 }).then(() => check('4c Khmer school name typed in the real UI is saved and shown in the header', true)).catch(() => check('4c Khmer school name shown in the header', false));
  await shot('04-dashboard');

  // ---- 4½. Settings -> Academic and Settings -> Preferences (Phase 2a), driven through the real UI ----
  const YEAR_A = '២០២៦-២០២៧';
  const YEAR_B = '២០២៧-២០២៨';
  const YEAR_A_EDITED = '២០២៦-២០២៧ (កែ)';
  const yearForm = page.locator('.year-form');
  const subjectForm = page.locator('.modal.show');   // the add / rename subject form is a pop-up
  const yearRow = (name) => page.locator('tbody tr', { hasText: name });
  const yearButton = (name, label) => yearRow(name).getByRole('button', { name: label, exact: true });
  const badge = (name, kind) => yearRow(name).locator(`.badge.text-bg-${kind}`);
  const fillYear = async (name, start, end) => {
    await yearForm.locator('input[id^="field-nameKm-"]').fill(name);
    await yearForm.locator('input[id^="field-startDate-"]').fill(start);
    await yearForm.locator('input[id^="field-endDate-"]').fill(end);
  };
  const goTo = async (href, waitFor) => { await page.locator(`a[href="${href}"]`).first().click(); await waitFor.waitFor({ timeout: 30_000 }); };

  await goTo('/settings/academic', heading(t('academic.year.title')));
  // the subject list and the grade table are paged (5 main subjects to a page); this test works on all of them, so it asks for "all" once (the choice is kept while the program is open)
  await page.locator('li.subject-item').first().waitFor({ timeout: 15_000 });
  for (const id of ['subjects-pager', 'grade-subjects-pager']) {
    await page.locator(`[data-testid=${id}]`).waitFor({ timeout: 15_000 });
    await page.locator(`[data-testid=${id}] select`).selectOption('0');
  }
  check('4d the first academic year is made current by default (the checkbox is ticked)', await page.locator('#year-make-current').isChecked());
  await fillYear(YEAR_A, '2026-11-01', '2027-08-31');
  await yearForm.getByRole('button', { name: t('academic.year.create'), exact: true }).click();
  await yearRow(YEAR_A).waitFor({ timeout: 15_000 });
  check('4e the first year was created and is current', (await badge(YEAR_A, 'success').count()) === 1);

  await button(t('academic.year.add')).click();
  check('4f adding another year does NOT tick "current" (the running year must not be replaced silently)', !(await page.locator('#year-make-current').isChecked()));
  await fillYear(YEAR_B, '2027-11-01', '2028-08-31');
  await yearForm.getByRole('button', { name: t('academic.year.create'), exact: true }).click();
  await yearRow(YEAR_B).waitFor({ timeout: 15_000 });
  check('4g the second year exists, the first is still the current one', (await badge(YEAR_A, 'success').count()) === 1 && (await badge(YEAR_B, 'success').count()) === 0);

  await yearButton(YEAR_B, t('academic.year.makeCurrent')).click();
  await badge(YEAR_B, 'success').waitFor({ timeout: 15_000 });
  check('4h "make current" switches the current year (exactly one current year)', (await badge(YEAR_A, 'success').count()) === 0 && (await page.locator('tbody tr .badge.text-bg-success').count()) === 1);

  await yearButton(YEAR_B, t('academic.year.close')).click();
  await page.locator('.modal-footer').getByRole('button', { name: t('academic.year.close'), exact: true }).click();
  await badge(YEAR_B, 'secondary').waitFor({ timeout: 15_000 });
  check('4i closing asks for confirmation; the closed year is no longer current and cannot be edited',
    (await badge(YEAR_B, 'success').count()) === 0 && (await yearButton(YEAR_B, t('academic.year.edit')).count()) === 0 && (await yearButton(YEAR_B, t('academic.year.reopen')).count()) === 1);
  await yearButton(YEAR_B, t('academic.year.reopen')).click();
  await badge(YEAR_B, 'secondary').waitFor({ state: 'detached', timeout: 15_000 });
  check('4j a closed year can be reopened (it does not become current by itself)', (await badge(YEAR_B, 'success').count()) === 0 && (await yearButton(YEAR_B, t('academic.year.edit')).count()) === 1);

  await yearButton(YEAR_A, t('academic.year.edit')).click();
  check('4k editing fills the form with the year\'s own values', (await yearForm.locator('input[id^="field-nameKm-"]').inputValue()) === YEAR_A);
  await yearForm.locator('input[id^="field-nameKm-"]').fill(YEAR_A_EDITED);
  await yearForm.getByRole('button', { name: t('common.save'), exact: true }).click();
  await yearRow(YEAR_A_EDITED).waitFor({ timeout: 15_000 });
  check('4l the edited year name is saved', true);
  await scrollTop();
  await shot('04a-academic-years');

  await button(t('academic.subjects.add')).click();
  await subjectForm.locator('input[id^="field-nameKm-"]').fill('កុំព្យូទ័រ');
  await subjectForm.getByRole('button', { name: t('academic.subjects.create'), exact: true }).click();
  const computer = page.locator('.subject-item', { hasText: 'កុំព្យូទ័រ' });
  await computer.waitFor({ timeout: 15_000 });
  check('4m a new subject is added (Khmer name typed in the real UI)', true);
  await button(t('academic.subjects.add')).click();
  await subjectForm.locator('input[id^="field-nameKm-"]').fill('កុំព្យូទ័រ');
  await subjectForm.getByRole('button', { name: t('academic.subjects.create'), exact: true }).click();
  await subjectForm.getByText(t('validation.DUPLICATE')).first().waitFor({ timeout: 15_000 });
  check('4n the same subject name again is refused with the Khmer message next to the field', true);
  // that refusal is a 409 and Chromium logs it to the console: expect exactly this one, and take it out of the console audit (8c)
  const deliberate409 = consoleErrors.filter((e) => /status of 409/.test(e));
  check('4n2 ...and it was the only 409 so far (the console line below belongs to this deliberate step)', deliberate409.length === 1, `${deliberate409.length} found`);
  if (deliberate409.length === 1) consoleErrors.splice(consoleErrors.indexOf(deliberate409[0]), 1);
  await subjectForm.getByRole('button', { name: t('common.cancel'), exact: true }).click();
  await computer.getByRole('button', { name: t('academic.subjects.rename') }).click();
  await subjectForm.locator('input[id^="field-nameKm-"]').fill('ព័ត៌មានវិទ្យា');
  await subjectForm.getByRole('button', { name: t('common.save'), exact: true }).click();
  await page.locator('.subject-item', { hasText: 'ព័ត៌មានវិទ្យា' }).waitFor({ timeout: 15_000 });
  check('4o a subject can be renamed', true);

  const matrix = page.locator('table').filter({ has: page.locator('th', { hasText: 'ថ្នាក់ទី១' }) });
  await matrix.waitFor({ timeout: 15_000 });
  const matrixRow = matrix.locator('tbody tr', { hasText: 'ព័ត៌មានវិទ្យា' });
  const boxes = matrixRow.locator('input[type=checkbox]');
  check('4p the grade/subject table has six grade columns and the new subject is ticked for all six',
    (await matrix.locator('thead th').count()) === 7 && (await boxes.count()) === 6 && (await boxes.evaluateAll((els) => els.every((e) => e.checked))));
  const gradeSaved = page.waitForResponse((r) => /\/grades\/\d+\/subjects$/.test(r.url()) && r.request().method() === 'PUT');
  await boxes.first().uncheck();
  check('4q unticking one grade saves at once (PUT /grades/{id}/subjects answers 200)', (await gradeSaved).status() === 200);
  await shot('04b-academic');
  await goTo('/settings/system', page.locator('.health-row').first());
  await goTo('/settings/academic', matrix);
  const afterBoxes = matrix.locator('tbody tr', { hasText: 'ព័ត៌មានវិទ្យា' }).locator('input[type=checkbox]');
  const ticks = await afterBoxes.evaluateAll((els) => els.map((e) => e.checked));
  check('4r the saved choice comes back from the database after leaving and returning', ticks.length === 6 && ticks[0] === false && ticks.slice(1).every(Boolean), JSON.stringify(ticks));

  await goTo('/settings/preferences', heading(t('settings.preferences.title')));
  await field('reminderDays').waitFor({ timeout: 15_000 });
  check('4s Settings -> Preferences shows the saved defaults', (await field('reminderDays').inputValue()) === '0' && (await field('idleLockMinutes').inputValue()) === '10');
  await field('reminderDays').fill('14');
  const prefsSaved = page.waitForResponse((r) => r.url().endsWith('/api/v1/settings/app') && r.request().method() === 'PUT');
  await button(t('common.save')).click();
  check('4t saving preferences answers 200', (await prefsSaved).status() === 200);
  await shot('04c-preferences');
  await goTo('/settings/system', page.locator('.health-row').first());
  await goTo('/settings/preferences', heading(t('settings.preferences.title')));
  await field('reminderDays').waitFor({ timeout: 15_000 });
  check('4u the saved preference comes back after leaving and returning', (await field('reminderDays').inputValue()) === '14');

  // ---- 4¾. Phase 2: teachers, classes, students, enrolment, transfer, promotion, Excel, photo, print (real UI, real backend) ----
  const modal = page.locator('.modal.show');
  const selectField = (name, scope = page) => scope.locator(`select[id^="field-${name}-"]`).first();
  const T1 = 'លោកគ្រូ សុខា';
  const T2 = 'អ្នកគ្រូ ចន្ទា';
  const S_NAME = 'សុខ វណ្ណា';
  const row = (name) => page.locator('tbody tr', { hasText: name });
  const modalSave = () => modal.getByRole('button', { name: t('common.save'), exact: true }).click();
  const pickByText = async (selectLocator, text) => {   // a <select> option found by a piece of its text
    const value = await selectLocator.locator('option', { hasText: text }).first().getAttribute('value');
    await selectLocator.selectOption(value);
  };

  // teachers
  await goTo('/teachers', heading(t('teachers.title')));
  for (const [name, gender, phone] of [[T1, 'MALE', '០១២៣៤៥៦៧៨'], [T2, 'FEMALE', '']]) {
    await button(t('teachers.add')).click();
    await modal.locator('input[id^="field-nameKm-"]').fill(name);
    await selectField('gender', modal).selectOption({ label: t(`gender.${gender}`) });
    if (phone) await modal.locator('input[id^="field-phone-"]').fill(phone);
    await modalSave();
    await modal.waitFor({ state: 'detached', timeout: 15_000 });
    await row(name).waitFor({ timeout: 15_000 });
  }
  const teacherText = await page.locator('tbody').innerText();
  check('5a two teachers are added through the real UI and get codes T-001 and T-002', teacherText.includes('T-001') && teacherText.includes('T-002'));
  await page.locator('#teacher-search').fill('០១២៣');
  await row(T2).waitFor({ state: 'detached', timeout: 10_000 });
  check('5b searching with Khmer digits finds the teacher whose phone was typed in Khmer digits', (await row(T1).count()) === 1);
  await page.locator('#teacher-search').fill('');
  await row(T2).waitFor({ timeout: 10_000 });
  await row(T2).locator('a').click();
  await heading(T2).waitFor({ timeout: 15_000 });
  await button(t('teachers.deactivate')).click();
  await modal.getByRole('button', { name: t('teachers.deactivate'), exact: true }).click();
  await page.locator('.badge', { hasText: t('teacherStatus.INACTIVE') }).first().waitFor({ timeout: 15_000 });
  await button(t('teachers.reactivate')).click();
  await page.locator('.badge', { hasText: t('teacherStatus.ACTIVE') }).first().waitFor({ timeout: 15_000 });
  check('5c a teacher can be deactivated (with confirmation) and reactivated', true);

  // classes: the current year first (the academic block above left none), then two classes of grade 1, one of grade 2 in the other year
  await goTo('/settings/academic', heading(t('academic.year.title')));
  await yearButton(YEAR_B, t('academic.year.makeCurrent')).click();
  await badge(YEAR_B, 'success').waitFor({ timeout: 15_000 });
  await goTo('/classes', heading(t('classes.title')));
  const addClass = async (grade, name, teacher) => {
    await button(t('classes.add')).click();
    await selectField('gradeId', modal).selectOption({ label: grade });
    await modal.locator('input[id^="field-nameKm-"]').fill(name);
    if (teacher) await selectField('homeroomTeacherId', modal).selectOption({ label: teacher });
    await modalSave();
    await modal.waitFor({ state: 'detached', timeout: 15_000 });
  };
  await addClass('ថ្នាក់ទី១', 'ក', T1);
  await addClass('ថ្នាក់ទី១', 'ខ', null);
  await row('ក').first().waitFor({ timeout: 15_000 });
  const classText = await page.locator('tbody').innerText();
  check('5d classes are added; the list shows grade, homeroom teacher and 0 / 40 students', classText.includes('ថ្នាក់ទី១') && classText.includes(T1) && classText.includes('0 / 40'), classText.replace(/\s+/g, ' ').slice(0, 120));
  await page.locator('#class-year').selectOption({ label: YEAR_A_EDITED });
  await addClass('ថ្នាក់ទី២', 'ក', null);
  await row('ថ្នាក់ទី២').waitFor({ timeout: 15_000 });
  await page.locator('#class-year').selectOption({ label: `${YEAR_B} (${t('academic.year.current')})` });
  await page.locator('tbody tr', { hasText: 'ថ្នាក់ទី១' }).first().waitFor({ timeout: 15_000 });
  check('5e switching the academic year shows that year\'s classes only', (await page.locator('tbody tr', { hasText: 'ថ្នាក់ទី២' }).count()) === 0);

  // subject teachers of the first grade-1 class
  await page.locator('tbody tr', { hasText: 'ថ្នាក់ទី១' }).first().locator('a').click();
  await heading(t('classes.teachersTitle')).waitFor({ timeout: 15_000 });
  const khmerTeacher = page.getByLabel(t('classes.teacherOf').replace('{subject}', 'ភាសាខ្មែរ'));
  await khmerTeacher.selectOption({ label: T1 });
  await page.locator('.card', { has: heading(t('classes.teachersTitle')) }).getByRole('button', { name: t('common.save'), exact: true }).click();
  await page.waitForTimeout(800);
  await goTo('/teachers', heading(t('teachers.title')));
  await goTo('/classes', heading(t('classes.title')));
  await page.locator('tbody tr', { hasText: 'ថ្នាក់ទី១' }).first().locator('a').click();
  await heading(t('classes.teachersTitle')).waitFor({ timeout: 15_000 });
  check('5f the subject teacher chosen for the class is saved and comes back', (await page.getByLabel(t('classes.teacherOf').replace('{subject}', 'ភាសាខ្មែរ')).evaluate((el) => el.selectedOptions[0]?.textContent?.trim())) === T1);

  // students: register with a guardian and a class
  const registerStudent = async (confirmDuplicate) => {
    await goTo('/students', heading(t('students.title')));
    await page.locator('a[href="/students/new"]').click();
    await heading(t('students.sectionPerson')).waitFor({ timeout: 15_000 });
    await field('nameKm').fill(S_NAME);
    await field('nameEn').fill('Sok Vanna');
    await selectField('gender').selectOption({ label: t('gender.FEMALE') });
    await field('dateOfBirth').fill('2019-05-01');
    if (!confirmDuplicate) await pickByText(selectField('classId'), 'ថ្នាក់ទី១ ក');   // the namesake is registered without a class
    await button(t('students.addGuardian')).click();
    await page.locator('#guardian-name-0').fill('សុខ ចាន់');
    await page.locator('#guardian-rel-0').selectOption({ label: t('relationship.FATHER') });
    await page.locator('#guardian-phone-0').fill('០១២៣៤៥៦៧៨៩');
    await button(t('common.save')).click();
    if (confirmDuplicate) {
      await modal.getByRole('button', { name: t('students.saveAnyway'), exact: true }).waitFor({ timeout: 15_000 });
      const dialogText = await modal.innerText();
      await modal.getByRole('button', { name: t('students.saveAnyway'), exact: true }).click();
      return dialogText;
    }
    return '';
  };
  await registerStudent(false);
  await page.waitForURL(/\/students\/\d+$/, { timeout: 30_000 });
  const studentUrl = page.url();
  await heading(t('students.historyTitle')).waitFor({ timeout: 15_000 });   // the profile has finished loading
  const profileText = await page.locator('.page-container').innerText();
  const code1 = /\d{4}-\d{4}/.exec(profileText)?.[0] ?? '';
  // A page reload would sign the user out (the session lives in memory only), so students are reopened through the list.
  const openStudent = async (code) => {
    await goTo('/students', heading(t('students.title')));
    await page.locator('#student-search').fill(code);
    await row(code).locator('a').click();
    await heading(t('students.historyTitle')).waitFor({ timeout: 15_000 });
  };
  check('5g a student is registered with a guardian and a class: the profile shows the code, guardian, class and history',
    /\d{4}-\d{4}/.test(profileText) && profileText.includes('សុខ ចាន់') && profileText.includes('ថ្នាក់ទី១ ក') && profileText.includes(t('enrollmentStatus.ACTIVE')), profileText.replace(/\s+/g, ' ').slice(0, 140));
  check('5h the guardian phone typed in Khmer digits is shown as ASCII digits', profileText.includes('0123456789'));

  // the same name and date of birth again: a warning, confirmed by the user
  const dialogText = await registerStudent(true);
  await page.waitForURL((u) => /\/students\/\d+$/.test(u.pathname) && !u.href.endsWith(new URL(studentUrl).pathname), { timeout: 30_000 });
  check('5i the same Khmer name + birth date asks for confirmation (showing the existing code) and then saves', /\d{4}-\d{4}/.test(dialogText) && dialogText.includes(t('students.duplicateTitle')), dialogText.replace(/\s+/g, ' ').slice(0, 120));
  const dup409 = consoleErrors.filter((e) => /status of 409/.test(e));
  check('5i2 ...and that warning was the only 409 since the last check (it is a deliberate step)', dup409.length === 1, `${dup409.length} found`);
  if (dup409.length === 1) consoleErrors.splice(consoleErrors.indexOf(dup409[0]), 1);

  // list, search, filter, Excel
  await goTo('/students', heading(t('students.title')));
  await page.locator('#student-search').fill('វណ្ណា');
  await page.waitForFunction((n) => document.body.innerText.includes(n), t('students.count').replace('{n}', '2'), { timeout: 15_000 });
  check('5j searching by a piece of the Khmer name lists both students', true);
  await page.locator('#student-search').fill('');
  await pickByText(page.locator('#student-class'), 'ថ្នាក់ទី១ ក');
  await page.waitForFunction((n) => document.body.innerText.includes(n), t('students.count').replace('{n}', '1'), { timeout: 15_000 });
  check('5k filtering by class lists only the enrolled student', true);
  const xlsxPath = path.join(outDir, 'app-students.xlsx');
  rmSync(xlsxPath, { force: true });
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, xlsxPath);
  await button(t('students.exportExcel')).click();
  for (let i = 0; i < 40 && !existsSync(xlsxPath); i++) await sleep(250);
  const xlsx = existsSync(xlsxPath) ? readFileSync(xlsxPath) : Buffer.alloc(0);
  check('5l "Export to Excel" saves a real .xlsx through the shell (a zip with the worksheet inside)', xlsx.subarray(0, 2).toString() === 'PK' && xlsx.includes(Buffer.from('xl/worksheets/sheet1.xml')), `${xlsx.length} bytes`);

  // photo, then a transfer to the other class
  await openStudent(code1);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.locator('.student-photo input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.student-photo-frame img').waitFor({ timeout: 15_000 });
  check('5m a student photo is uploaded, stored as a JPEG and shown through a blob URL', await page.locator('.student-photo-frame img').evaluate((img) => img.src.startsWith('blob:')));

  await button(t('students.move.transferTitle')).click();
  await pickByText(modal.locator('#move-class'), 'ថ្នាក់ទី១ ខ');
  await modal.getByRole('button', { name: t('students.move.transferConfirm'), exact: true }).click();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('tbody tr', { hasText: t('enrollmentStatus.CHANGED_CLASS') }).first().waitFor({ timeout: 15_000 });
  const history = await page.locator('.card', { has: heading(t('students.historyTitle')) }).innerText();
  check('5n moving to another class keeps both rows: the old one "changed class", the new one active', history.includes(t('enrollmentStatus.CHANGED_CLASS')) && history.includes(t('enrollmentStatus.ACTIVE')) && history.includes('ថ្នាក់ទី១ ខ'));

  // year-end promotion of that class into the other academic year
  await goTo('/students', heading(t('students.title')));
  await page.locator('a[href="/students/promotion"]').click();
  await heading(t('promotion.title')).waitFor({ timeout: 15_000 });
  await pickByText(page.locator('#promo-class'), 'ថ្នាក់ទី១ ខ');
  await page.locator('tbody tr', { hasText: S_NAME }).first().waitFor({ timeout: 15_000 });
  await button(t('promotion.preview')).click();
  await page.locator('.promotion-summary').waitFor({ timeout: 15_000 });
  const summaryText = await page.locator('.promotion-summary').innerText();
  check('5o the promotion preview says what would happen and writes nothing', summaryText.includes(t('promotion.summaryCounts').replace('{promoted}', '1').replace('{repeated}', '0').replace('{graduated}', '0')), summaryText.replace(/\s+/g, ' ').slice(0, 120));
  await button(t('promotion.apply')).click();
  await modal.getByRole('button', { name: t('promotion.apply'), exact: true }).click();
  await page.locator('.alert-success').waitFor({ timeout: 15_000 });
  await openStudent(code1);
  await page.locator('tbody tr', { hasText: t('enrollmentStatus.PROMOTED') }).first().waitFor({ timeout: 30_000 });
  check('5p after applying, the student\'s history shows PROMOTED and a new active row in the other year', (await page.locator('tbody tr', { hasText: t('enrollmentStatus.ACTIVE') }).count()) >= 1);

  // the printable profile and its PDF
  await page.locator('a[href^="/print/student/"]').click();
  await page.locator('.student-sheet').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  const sheet = await page.locator('.student-sheet').innerText();
  check('5q the printable profile shows the Khmer name, the code, the guardian and the history', sheet.includes(S_NAME) && /\d{4}-\d{4}/.test(sheet) && sheet.includes('សុខ ចាន់') && sheet.includes(t('enrollmentStatus.PROMOTED')), sheet.replace(/\s+/g, ' ').slice(0, 100));
  await shot('05a-student-print');
  const profilePdf = path.join(outDir, 'app-student-profile.pdf');
  rmSync(profilePdf, { force: true });
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, profilePdf);
  await button(t('print.savePdf')).click();
  for (let i = 0; i < 40 && !existsSync(profilePdf); i++) await sleep(250);
  const profilePdfBytes = existsSync(profilePdf) ? readFileSync(profilePdf) : Buffer.alloc(0);
  check('5r the student profile is saved as an A4 PDF through the shell', profilePdfBytes.subarray(0, 5).toString() === '%PDF-', `${profilePdfBytes.length} bytes`);
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('students.historyTitle')).waitFor({ timeout: 15_000 });
  await shot('05b-student-profile');
  await goTo('/students', heading(t('students.title')));
  await shot('05c-students');
  await goTo('/classes', heading(t('classes.title')));
  await shot('05d-classes');

  // ---- 4⅞. Phase 3: attendance, grading scales, examinations, scores, results, report cards, homework (real UI, real backend) ----
  const P1 = 'សិស្ស មួយ';
  const P2 = 'សិស្ស ពីរ';
  const P3 = 'សិស្ស បី';
  const CLASS_LABEL = 'ថ្នាក់ទី១ ក';
  const EXAM = 'ប្រឡងប្រចាំខែតុលា';
  const KHMER = 'ភាសាខ្មែរ';
  const MATH = 'គណិតវិទ្យា';
  const localIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);   // the PC's calendar day, as the UI computes it
  const dayOffset = (n) => localIso(new Date(Date.now() + n * 86_400_000));
  const putOk = async (urlPart, click) => {   // clicks, then answers the status of the PUT that click caused (not a toast an earlier step left behind)
    const wait = page.waitForResponse((r) => r.url().includes(urlPart) && r.request().method() === 'PUT');
    try {
      await click();
    } catch (error) {
      wait.catch(() => {});   // a failed click must be reported as itself, not as a response that never came
      throw error;
    }
    return (await wait).status();
  };
  const pupils = page.locator('tbody tr[data-student]');
  const pupil = (name) => pupils.filter({ hasText: name });   // one student's row, whatever the order of the list
  const scoreBox = (name) => pupil(name).locator('input[data-score-input]');
  const khmerOrder = [P1, P2, P3].sort(new Intl.Collator('und', { numeric: true }).compare);   // lists are sorted by Khmer name on the client (D13)
  const pdfPages = (bytes) => (bytes.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const savePdfTo = async (file) => {
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('print.savePdf')).click();
    for (let i = 0; i < 40 && !existsSync(file); i++) await sleep(250);
    await sleep(500);
    return existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
  };

  // three students in the first grade-1 class of the current year
  const addPupil = async (name, dob) => {
    await goTo('/students', heading(t('students.title')));
    await page.locator('a[href="/students/new"]').click();
    await heading(t('students.sectionPerson')).waitFor({ timeout: 15_000 });
    await field('nameKm').fill(name);
    await selectField('gender').selectOption({ label: t('gender.MALE') });
    await field('dateOfBirth').fill(dob);
    await pickByText(selectField('classId'), CLASS_LABEL);
    await button(t('common.save')).click();
    await page.waitForURL(/\/students\/\d+$/, { timeout: 30_000 });
    await heading(t('students.historyTitle')).waitFor({ timeout: 15_000 });
  };
  await addPupil(P1, '2019-01-01');
  await addPupil(P2, '2019-01-02');
  await addPupil(P3, '2019-01-03');

  // attendance: take a day
  await goTo('/attendance', heading(t('attendance.title')));
  await pupils.first().waitFor({ timeout: 15_000 });
  const rosterNames = await pupils.locator('td:nth-child(2)').allInnerTexts();
  check('P3-1 attendance: the roster of the first class lists the three students enrolled today in Khmer alphabetical order, nothing recorded yet',
    rosterNames.join('|') === khmerOrder.join('|') && khmerOrder.join('|') !== [P1, P2, P3].join('|') && (await page.locator('tbody input[type=radio]:checked').count()) === 0 && (await page.locator('.badge', { hasText: t('attendance.notRecorded') }).count()) === 1, rosterNames.join('|'));
  check('P3-1b the current academic year starts in the future here, so choosing today warns that the day is outside the year', (await page.locator('[data-testid=outside-year]').count()) === 1);
  await button(t('attendance.markAllPresent')).click();
  const countsAfterAll = await page.locator('[data-testid=attendance-counts]').innerText();
  check('P3-2 "mark all present" ticks everybody and the counter says 3 present', countsAfterAll.includes(`${t('attendance.status.PRESENT')} 3`) && (await page.locator('tbody input[type=radio][value=PRESENT]:checked').count()) === 3, countsAfterAll.replace(/\s+/g, ' '));
  await pupil(P2).getByText(t('attendance.status.ABSENT'), { exact: true }).click();
  await pupil(P2).locator('input[maxlength="200"]').fill('ឈឺ');
  check('P3-3 changing one student to absent updates the counter', (await page.locator('[data-testid=attendance-counts]').innerText()).includes(`${t('attendance.status.ABSENT')} 1`));
  check('P3-4 saving the day answers 200', (await putOk('/attendance/sheet', () => button(t('common.save')).click())) === 200);
  await page.locator('.badge', { hasText: t('attendance.recorded') }).waitFor({ timeout: 15_000 });
  await shot('06a-attendance');

  // what was saved comes back from the database after leaving the page
  await goTo('/exams', heading(t('exams.title')));
  await goTo('/attendance', heading(t('attendance.title')));
  await pupils.first().waitFor({ timeout: 15_000 });
  const statuses = async () => Promise.all([P1, P2, P3].map((n) => pupil(n).locator('input[type=radio]:checked').getAttribute('value')));   // P1, P2, P3 in that order
  check('P3-5 the saved day comes back from the database: present, absent (with the remark), present',
    (await statuses()).join(',') === 'PRESENT,ABSENT,PRESENT' && (await pupil(P2).locator('input[maxlength="200"]').inputValue()) === 'ឈឺ', (await statuses()).join(','));

  // a correction: late, then absent again (the audit trail keeps each old value; that is proven by the backend test)
  await pupil(P2).getByText(t('attendance.status.LATE'), { exact: true }).click();
  check('P3-6 correcting a saved student answers 200', (await putOk('/attendance/sheet', () => button(t('common.save')).click())) === 200);
  await pupil(P2).getByText(t('attendance.status.ABSENT'), { exact: true }).click();
  await putOk('/attendance/sheet', () => button(t('common.save')).click());

  // unsaved choices are not lost by accident: changing the day asks first, and "cancel" puts everything back
  await pupil(P3).getByText(t('attendance.status.LEAVE'), { exact: true }).click();
  await page.locator('#attendance-date').fill(dayOffset(-1));
  await modal.waitFor({ timeout: 10_000 });
  check('P3-7 changing the day with unsaved choices asks before discarding', (await modal.innerText()).includes(t('attendance.discardTitle')));
  await modal.getByRole('button', { name: t('common.cancel'), exact: true }).click();
  await modal.waitFor({ state: 'detached', timeout: 10_000 });
  check('P3-8 cancelling keeps the day and the unsaved choice', (await page.locator('#attendance-date').inputValue()) === dayOffset(0) && (await statuses()).join(',') === 'PRESENT,ABSENT,LEAVE', `${await page.locator('#attendance-date').inputValue()} ${(await statuses()).join(',')}`);
  await pupil(P3).getByText(t('attendance.status.PRESENT'), { exact: true }).click();   // back to what is saved: nothing unsaved is left

  // history and the printable summary
  await page.locator('#attendance-tab-history').click();
  const summaryRow = (name) => page.locator('tbody tr:visible', { hasText: name });   // the (hidden) entry tab lists the same names
  await summaryRow(P2).first().waitFor({ timeout: 15_000 });
  const p2Cells = await summaryRow(P2).first().locator('td').allInnerTexts();
  check('P3-9 the history counts by days (the school\'s official method until it chooses): the absent student has 0 present, 0 late, 0 partial, 1 absent, 0 leave of 1 day', p2Cells.slice(2).join(',') === '0,0,0,1,0,1', p2Cells.join(','));
  await page.locator('a[href^="/print/attendance"]').click();
  await page.locator('.student-sheet').waitFor({ timeout: 15_000 });
  const attendanceSheet = await page.locator('.student-sheet').innerText();
  check('P3-10 the printable attendance summary names the class and the students', attendanceSheet.includes(CLASS_LABEL) && attendanceSheet.includes(P1) && attendanceSheet.includes(P2) && attendanceSheet.includes(t('print.attendance.title')), attendanceSheet.replace(/\s+/g, ' ').slice(0, 100));
  const attendancePdf = await savePdfTo(path.join(outDir, 'app-attendance.pdf'));
  check('P3-11 the attendance summary is saved as a one-page A4 PDF through the shell', attendancePdf.subarray(0, 5).toString() === '%PDF-' && pdfPages(attendancePdf) === 1, `${attendancePdf.length} bytes, ${pdfPages(attendancePdf)} page(s)`);
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('attendance.title')).waitFor({ timeout: 15_000 });

  // grading scales: the default exists, a bad scale is refused next to the form, a good one is saved and can become the default
  await goTo('/settings/grading', heading(t('grading.title')));
  const scaleCards = page.locator('[data-scale]');
  await scaleCards.first().waitFor({ timeout: 15_000 });
  const defaultText = await scaleCards.first().innerText();
  check('P3-12 the standard grading scale is there: default badge, pass mark 50, bands A to F', defaultText.includes(t('grading.default')) && defaultText.includes(t('grading.passMarkIs').replace('{percent}', '50')) && ['A', 'B', 'C', 'D', 'E', 'F'].every((l) => defaultText.includes(l)), defaultText.replace(/\s+/g, ' ').slice(0, 100));
  await button(t('grading.add')).click();
  await field('nameKm').fill('មាត្រដ្ឋានសាកល្បង');
  const lastBand = modal.locator('input[id^="band-min-"]').last();
  const realMin = await lastBand.inputValue();
  await lastBand.fill('5');
  await modalSave();
  await modal.locator('.field-error', { hasText: t('validation.BAND_ZERO_REQUIRED') }).waitFor({ timeout: 10_000 });
  check('P3-13 a scale where nobody below 5 % would get a band is refused with a Khmer message and the form stays open', (await modal.count()) === 1);
  await lastBand.fill(realMin);
  await modalSave();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('[data-scale="មាត្រដ្ឋានសាកល្បង"]').waitFor({ timeout: 15_000 });
  check('P3-14 the corrected scale is saved: two scales, still exactly one default', (await scaleCards.count()) === 2 && (await page.locator('[data-scale] .badge', { hasText: t('grading.default') }).count()) === 1);
  const defaultAnswer = page.waitForResponse((r) => r.url().includes('/set-default'));
  await page.locator('[data-scale="មាត្រដ្ឋានសាកល្បង"]').getByRole('button', { name: t('grading.makeDefault'), exact: true }).click();
  await defaultAnswer;
  await page.locator('[data-scale="មាត្រដ្ឋានសាកល្បង"] .badge', { hasText: t('grading.default') }).waitFor({ timeout: 15_000 });
  const backAnswer = page.waitForResponse((r) => r.url().includes('/set-default'));
  await page.locator('[data-scale]').filter({ hasNotText: 'មាត្រដ្ឋានសាកល្បង' }).getByRole('button', { name: t('grading.makeDefault'), exact: true }).click();
  await backAnswer;
  await page.locator('[data-scale="មាត្រដ្ឋានសាកល្បង"] .badge', { hasText: t('grading.default') }).waitFor({ state: 'detached', timeout: 15_000 });
  check('P3-15 the default moves between scales (one default at a time) and the standard scale is the default again', (await page.locator('[data-scale] .badge', { hasText: t('grading.default') }).count()) === 1 && (await scaleCards.first().innerText()).includes(t('grading.default')));
  await shot('06b-grading');

  // an examination: created, its subjects trimmed to Khmer (max 10) and Mathematics (weight 2)
  await goTo('/exams', heading(t('exams.title')));
  await button(t('exams.add')).click();
  await modal.locator('input[id^="field-nameKm-"]').fill(EXAM);
  await modalSave();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await row(EXAM).waitFor({ timeout: 15_000 });
  check('P3-16 an examination is added and listed with its kind', (await row(EXAM).innerText()).includes(t('exams.kind.MONTHLY')));
  await row(EXAM).locator('a').click();
  await heading(EXAM).waitFor({ timeout: 15_000 });
  await page.locator('#exam-tab-subjects').click();
  const subjectRows = page.locator('tr[data-subject]');
  await subjectRows.first().waitFor({ timeout: 15_000 });
  const startSubjects = await subjectRows.count();
  check('P3-17 every subject of grade 1 starts in the examination (maximum 100, weight 1)', startSubjects >= 7 && (await subjectRows.first().locator('input').first().inputValue()) === '100', `${startSubjects} subjects`);
  for (;;) {
    const names = await subjectRows.evaluateAll((els) => els.map((e) => e.getAttribute('data-subject')));
    const victim = names.find((n) => n !== KHMER && n !== MATH);
    if (!victim) break;
    await page.locator(`tr[data-subject="${victim}"] button[aria-label="${t('common.remove')}"]`).click();
    await modal.getByRole('button', { name: t('common.remove'), exact: true }).click();
    await page.locator(`tr[data-subject="${victim}"]`).waitFor({ state: 'detached', timeout: 15_000 });
  }
  const subjectRow = (name) => page.locator(`tr[data-subject="${name}"]`);
  await subjectRow(KHMER).locator(`input[aria-label="${t('exams.maxScore')}"]`).fill('10');
  check('P3-18 a maximum that is not a positive number is refused in the row', await (async () => {
    await subjectRow(KHMER).locator(`input[aria-label="${t('exams.maxScore')}"]`).fill('0');
    await subjectRow(KHMER).getByRole('button', { name: t('common.save'), exact: true }).click();
    const shown = await subjectRow(KHMER).locator('.field-error').first().innerText();
    await subjectRow(KHMER).locator(`input[aria-label="${t('exams.maxScore')}"]`).fill('10');
    return shown === t('validation.OUT_OF_RANGE');
  })());
  check('P3-19 the Khmer maximum (10) is saved', (await putOk(`/examinations/`, () => subjectRow(KHMER).getByRole('button', { name: t('common.save'), exact: true }).click())) === 200);
  await subjectRow(MATH).locator(`input[aria-label="${t('exams.weight')}"]`).fill('2');
  check('P3-20 the Mathematics weight (2) is saved', (await putOk(`/examinations/`, () => subjectRow(MATH).getByRole('button', { name: t('common.save'), exact: true }).click())) === 200);

  // scores
  await page.locator('#exam-tab-scores').click();
  // The sheet is for the chosen subject once its maximum is on screen ("10" must not match "100", hence the look-ahead).
  const pickSubject = async (name, max) => {
    await page.locator('#score-subject').selectOption({ label: name });
    await page.waitForFunction((p) => new RegExp(p).test(document.body.innerText), t('exams.maxIs').replace('{max}', max) + '(?![0-9])', { timeout: 15_000 });
    await pupils.first().waitFor({ timeout: 15_000 });
  };
  await pickSubject(KHMER, '10');
  await scoreBox(P1).fill('8.5');
  await pupil(P2).locator('input[type=checkbox]').check();
  await scoreBox(P3).fill('11');
  const tooHigh = await pupil(P3).locator('.field-error').innerText();
  const saveDisabled = await button(t('common.save')).isDisabled();
  await scoreBox(P3).fill('7.555');
  const tooPrecise = await pupil(P3).locator('.field-error').innerText();
  check('P3-21 a score above the maximum, or with three decimals, is refused next to the row and Save is disabled', tooHigh === t('validation.OUT_OF_RANGE') && tooPrecise === t('validation.INVALID_NUMBER') && saveDisabled, `${tooHigh} | ${tooPrecise}`);
  await scoreBox(P3).fill('10');
  check('P3-22 ticking "absent" disables and clears that student\'s score box', (await scoreBox(P2).isDisabled()) && (await scoreBox(P2).inputValue()) === '');
  check('P3-23 saving the Khmer scores answers 200', (await putOk('/scores', () => button(t('common.save')).click())) === 200);

  // with only Khmer entered, every result is incomplete: no percentage, band, rank or pass until Mathematics is in too
  await page.locator('#exam-tab-results').click();
  await page.locator('[data-testid=results-table] tbody tr[data-student]').first().waitFor({ timeout: 15_000 });
  const incompleteRows = await page.locator('[data-testid=results-table] tbody tr[data-student]').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())));
  check('P3-23b with Mathematics missing all three results are incomplete: rank, percentage and band are blank, the outcome says so, and the page says how many',
    incompleteRows.length === 3 && incompleteRows.every((c) => c[0] === '—' && c.at(-3) === '—' && c.at(-2) === '—' && c.at(-1) === t('exams.incomplete'))
    && (await page.locator('[data-testid=results-incomplete]').innerText()).includes(t('exams.incompleteNote').replace('{count}', '3')), JSON.stringify(incompleteRows[0]));
  await page.locator('#exam-tab-scores').click();

  await pickSubject(MATH, '100');
  await scoreBox(P1).fill('90');
  await scoreBox(P2).fill('55.5');
  await scoreBox(P3).fill('100');
  await scoreBox(khmerOrder[0]).press('Enter');
  check('P3-24a Enter in a score box moves to the next student\'s box', await scoreBox(khmerOrder[1]).evaluate((el) => el === document.activeElement));
  check('P3-24 saving the Mathematics scores answers 200', (await putOk('/scores', () => button(t('common.save')).click())) === 200);
  await pickSubject(KHMER, '10');
  check('P3-25 the saved Khmer scores come back: 8.5, absent, 10', (await scoreBox(P1).inputValue()) === '8.5' && (await pupil(P2).locator('input[type=checkbox]').isChecked()) && (await scoreBox(P3).inputValue()) === '10');
  await shot('06c-scores');

  // results: weighted percentage, band, pass, rank (absent counts as 0 and is flagged)
  await page.locator('#exam-tab-results').click();
  await page.locator('[data-testid=results-table] tbody tr[data-student]').first().waitFor({ timeout: 15_000 });
  const resultCells = async (name) => page.locator('[data-testid=results-table] tbody tr', { hasText: name }).first().locator('td').allInnerTexts();
  const [c1, c2, c3] = [await resultCells(P1), await resultCells(P2), await resultCells(P3)];
  const tail = (cells) => cells.slice(-4).map((s) => s.replace(/\s+/g, ' ').trim());   // total, percent, band, outcome
  check('P3-26 student 1: rank 2, 89.76 %, band B, passed',
    c1[0].trim() === '2' && tail(c1)[1] === '89.76' && tail(c1)[2] === `B · ${'ល្អណាស់'}` && tail(c1)[3] === t('exams.passed'), JSON.stringify(c1));
  check('P3-27 student 2 (absent in Khmer, counted as 0 and flagged *): rank 3, 52.86 %, band E, passed',
    c2[0].trim() === '3' && tail(c2)[0].includes('*') && tail(c2)[1] === '52.86' && tail(c2)[2].startsWith('E') && tail(c2)[3] === t('exams.passed'), JSON.stringify(c2));
  check('P3-28 student 3 (full marks): rank 1, 100 %, band A', c3[0].trim() === '1' && tail(c3)[1] === '100' && tail(c3)[2].startsWith('A'), JSON.stringify(c3));
  check('P3-29 no "incomplete" note: every subject of the examination has scores', (await page.locator('[data-testid=results-incomplete]').count()) === 0);
  await shot('06d-results');

  // The year's dates did not cover the day attendance was recorded. After correcting them in Settings the warning is gone and the cards count that day.
  await goTo('/settings/academic', heading(t('academic.year.title')));
  await yearButton(YEAR_B, t('academic.year.edit')).click();
  await fillYear(YEAR_B, dayOffset(-30), dayOffset(200));
  check('P3-30a correcting the academic year\'s dates answers 200', (await putOk('/academic-years/', () => yearForm.getByRole('button', { name: t('common.save'), exact: true }).click())) === 200);
  await goTo('/attendance', heading(t('attendance.title')));
  await pupils.first().waitFor({ timeout: 15_000 });
  check('P3-30b with the year covering today the warning is gone', (await page.locator('[data-testid=outside-year]').count()) === 0);
  await goTo('/exams', heading(t('exams.title')));
  await row(EXAM).locator('a').click();
  await heading(EXAM).waitFor({ timeout: 15_000 });

  // report cards: preselected from the examination page, a comment, then every card of the class printed
  await page.locator('a[href^="/report-cards?examinationId="]').click();
  await heading(t('reportCards.title')).waitFor({ timeout: 15_000 });
  await page.locator('[data-testid=cards-table] tbody tr[data-student]').first().waitFor({ timeout: 15_000 });
  check('P3-30 the report card page opens on that examination and class, with the three students and their percentages',
    (await page.locator('#card-exam').evaluate((el) => el.selectedOptions[0]?.textContent?.trim())) === EXAM && (await page.locator('[data-testid=cards-table] tbody tr[data-student]').count()) === 3
    && (await page.locator('[data-testid=cards-table] tbody tr', { hasText: P1 }).innerText()).includes('89.76'));
  const COMMENT = 'ខិតខំប្រឹងប្រែងល្អ';
  await page.locator('[data-testid=cards-table] tbody tr', { hasText: P1 }).getByRole('button', { name: t('reportCards.writeComment'), exact: true }).click();
  await page.locator('#report-comment').fill(COMMENT);
  check('P3-31 saving the teacher\'s comment answers 204', (await putOk('/report-cards/comment', () => modalSave())) === 204);
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('[data-testid=cards-table] tbody tr', { hasText: P1 }).locator('.comment-cell', { hasText: COMMENT }).waitFor({ timeout: 15_000 });
  check('P3-32 the comment is shown in the list after saving', true);

  await page.locator('[data-testid=print-all]').click();
  await page.locator('.report-card').first().waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll('.report-card').length === 3, null, { timeout: 15_000 });
  await page.waitForTimeout(800);
  const card1 = await page.locator('.report-card', { hasText: P1 }).innerText();
  const card2 = await page.locator('.report-card', { hasText: P2 }).innerText();
  check('P3-33 the printed card of student 1 has the school, the examination, the scores, 89.76 %, rank 2 of 3, the comment and the attendance',
    card1.includes(SCHOOL) && card1.includes(EXAM) && card1.includes('8.5') && card1.includes('89.76') && card1.includes(t('print.reportCard.rankOf').replace('{rank}', '2').replace('{count}', '3')) && card1.includes(COMMENT) && card1.includes(t('print.reportCard.attendance')), card1.replace(/\s+/g, ' ').slice(0, 140));
  check('P3-34 the card of the absent student shows "absent" for Khmer, the footnote, and 0 present / 1 absent / 0 / 0 / 1 day in the attendance summary',
    card2.includes(t('exams.absentShort')) && card2.includes(t('exams.absentAsZero')) && card2.includes('0\t0\t0\t1\t0\t1'), card2.replace(/\s+/g, ' ').slice(-160));
  check('P3-34b ...and the card of the present student has 1 present / 0 / 0 / 0 / 0 / 1 day (the card counts days)', card1.includes('1\t0\t0\t0\t0\t1'), card1.replace(/\s+/g, ' ').slice(-120));
  check('P3-35 the toolbar says three cards', (await page.locator('[data-testid=card-count]').innerText()).includes(t('print.reportCard.count').replace('{count}', '3')));
  check('P3-35b every card says the grading rules are a draft (nobody has signed them off), inside the card so it prints', (await page.locator('.report-card [data-testid=card-draft-note]').count()) === 3
    && (await page.locator('.report-card [data-testid=card-draft-note]').first().innerText()).includes(t('acceptance.draft.cardLine').slice(0, 20)));
  // pictures of whole cards: toasts hidden, and the scroll box of the print screen opened so nothing is cut off
  await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
  await page.addStyleTag({ content: '.print-screen { height: auto !important; overflow: visible !important; }' });
  await page.locator('.report-card', { hasText: P1 }).screenshot({ path: path.join(outDir, 'app-06e-report-card.png') });
  await page.locator('.report-card', { hasText: P2 }).screenshot({ path: path.join(outDir, 'app-06e-report-card-absent.png') });
  const cardsPdf = await savePdfTo(path.join(outDir, 'app-report-cards.pdf'));
  check('P3-36 the class is saved as an A4 PDF with exactly one page per card', cardsPdf.subarray(0, 5).toString() === '%PDF-' && pdfPages(cardsPdf) === 3, `${cardsPdf.length} bytes, ${pdfPages(cardsPdf)} page(s)`);
  // Worst case: the sheet is drawn 210 mm wide with 15 mm margins, so its height is what the page must hold (297 mm = 1122 px).
  // The sheet's own minimum height (one full page) is lifted so a short card is measured as it is.
  const tall = await page.evaluate(() => {
    const card = document.querySelector('.report-card');
    card.style.minHeight = '0';
    const body = card.querySelector('.report-card-scores tbody');
    const template = body.querySelector('tr');
    while (body.querySelectorAll('tr').length < 12) body.appendChild(template.cloneNode(true));
    return { rows: body.querySelectorAll('tr').length, height: Math.ceil(card.getBoundingClientRect().height) };
  });
  check('P3-36b a card with twelve subjects still fits one A4 page', tall.rows === 12 && tall.height <= 1122, JSON.stringify(tall));
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('reportCards.title')).waitFor({ timeout: 15_000 });

  // homework
  await goTo('/homework', heading(t('homework.title')));
  await button(t('homework.add')).click();
  await selectField('classId', modal).selectOption({ label: CLASS_LABEL });
  await selectField('subjectId', modal).selectOption({ label: KHMER });
  await modal.locator('input[id^="field-title-"]').fill('លំហាត់ទំព័រ ១២');
  await modal.locator('input[id^="field-dueDate-"]').fill(dayOffset(2));
  await modalSave();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  const hwRow = page.locator('tr[data-homework="លំហាត់ទំព័រ ១២"]');
  await hwRow.waitFor({ timeout: 15_000 });
  check('P3-37 homework is recorded and listed as "given"', (await hwRow.innerText()).includes(t('homework.status.ASSIGNED')) && (await hwRow.innerText()).includes(CLASS_LABEL));
  check('P3-38 marking it done answers 200', (await putOk('/status', () => hwRow.getByRole('button', { name: t('homework.markDone'), exact: true }).click())) === 200);
  await hwRow.locator('.badge', { hasText: t('homework.status.DONE') }).waitFor({ timeout: 15_000 });
  await page.locator('#homework-status').selectOption({ label: t('homework.status.ASSIGNED') });
  await hwRow.waitFor({ state: 'detached', timeout: 15_000 });
  check('P3-39 filtering by "given" hides the finished homework', (await hwRow.count()) === 0);
  await page.locator('#homework-status').selectOption({ label: t('homework.allStatuses') });
  await hwRow.waitFor({ timeout: 15_000 });
  await shot('06f-homework');

  // ---- 4⅞⅞. Phase 4: dashboard, school events, printed-report options, reports, fees, a frozen grading scale (real UI, real backend) ----
  const FEE_MONTHLY = 'ថ្លៃសិក្សាប្រចាំខែ';
  const FEE_BOOK = 'ថ្លៃសៀវភៅ';
  const FEE_UNIFORM = 'ថ្លៃឯកសណ្ឋាន';
  const sheetRows = () => page.locator('[data-testid=report-sheet] tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())));
  const postJson = async (urlPart, click) => {   // clicks, then answers status + body of the POST that click caused
    const wait = page.waitForResponse((r) => r.url().includes(urlPart) && r.request().method() === 'POST');
    try {
      await click();
    } catch (error) {
      wait.catch(() => {});   // a failed click must be reported as itself, not as a response that never came
      throw error;
    }
    const r = await wait;
    return { status: r.status(), body: await r.json().catch(() => null) };
  };
  const recordPayment = () => modal.getByRole('button', { name: t('fees.recordPayment'), exact: true }).click();
  const unzipEntry = (buf, name) => {   // the one file of an .xlsx (a zip) that is asked for
    const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let off = buf.readUInt32LE(end + 16);
    for (let i = 0, count = buf.readUInt16LE(end + 10); i < count; i++) {
      const method = buf.readUInt16LE(off + 10);
      const size = buf.readUInt32LE(off + 20);
      const nameLen = buf.readUInt16LE(off + 28);
      const extra = buf.readUInt16LE(off + 30);
      const comment = buf.readUInt16LE(off + 32);
      const local = buf.readUInt32LE(off + 42);
      if (buf.toString('utf8', off + 46, off + 46 + nameLen) === name) {
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(start, start + size);
        return method === 0 ? data : inflateRawSync(data);
      }
      off += 46 + nameLen + extra + comment;
    }
    return Buffer.alloc(0);
  };
  const saveXlsx = async (file) => {
    rmSync(file, { force: true });
    await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, file);
    await button(t('reports.excel')).click();
    for (let i = 0; i < 40 && !existsSync(file); i++) await sleep(250);
    await sleep(300);
    return existsSync(file) ? readFileSync(file) : Buffer.alloc(0);
  };
  const elementShot = async (locator, file) => {
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
    await page.addStyleTag({ content: '.print-screen { height: auto !important; overflow: visible !important; }' });
    await locator.screenshot({ path: path.join(outDir, file) });
  };
  const openByName = async (name) => {
    await goTo('/students', heading(t('students.title')));
    await page.locator('#student-search').fill(name);
    await row(name).locator('a').click();
    await heading(t('students.historyTitle')).waitFor({ timeout: 15_000 });
  };

  // the dashboard: real figures
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  const stat = (id) => page.locator(`[data-testid=stat-${id}]`).innerText();
  const figures = [await stat('students'), await stat('teachers'), await stat('classes'), await stat('attendance')].map((s) => s.trim());
  check('P4-1 the dashboard counts 5 students, 2 teachers, 2 classes this year, and 1 of 2 classes with attendance today',
    figures.join('|') === '5|2|2|1 / 2', figures.join('|'));
  check('P4-2 ...with today\'s attendance split (2 present, 1 absent) and the latest examination with its 6 scores',
    (await page.locator('[data-testid=stat-attendance]').locator('xpath=..').innerText()).includes(t('dashboard.attendanceSplitDays').replace('{present}', '2').replace('{late}', '0').replace('{partial}', '0').replace('{absent}', '1').replace('{leave}', '0'))
    && (await page.locator('[data-testid=recent-exams]').innerText()).includes(EXAM) && (await page.locator('[data-testid=recent-exams]').innerText()).includes(t('dashboard.scoresEntered').replace('{n}', '6')));
  check('P4-3 no fee figure while fees are off, and no Fees entry in the menu', (await page.locator('[data-testid=fees-outstanding]').count()) === 0 && (await page.locator('a[href="/fees"]').count()) === 0);

  // school events: add two, refuse a bad one, edit, delete
  const events = page.locator('[data-testid=events-card]');
  const addEvent = async (title, startOffset, endOffset, note) => {
    await events.getByRole('button', { name: t('events.add'), exact: true }).click();
    await modal.locator('input[id^="field-titleKm-"]').fill(title);
    await modal.locator('input[id^="field-startDate-"]').fill(dayOffset(startOffset));
    if (endOffset !== null) await modal.locator('input[id^="field-endDate-"]').fill(dayOffset(endOffset));
    if (note) await modal.locator('textarea[id^="field-note-"]').fill(note);
  };
  await addEvent('សប្តាហ៍ប្រឡងឆមាស', 3, 5, 'សូមមកទាន់ពេល');
  await modalSave();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await events.locator('[data-event="សប្តាហ៍ប្រឡងឆមាស"]').waitFor({ timeout: 15_000 });
  await addEvent('ថ្ងៃឈប់សម្រាក', 1, null, null);
  await modalSave();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await events.locator('[data-event="ថ្ងៃឈប់សម្រាក"]').waitFor({ timeout: 15_000 });
  check('P4-4 events are listed earliest first, with their note', (await events.locator('li[data-event]').evaluateAll((li) => li.map((x) => x.getAttribute('data-event')))).join('|') === 'ថ្ងៃឈប់សម្រាក|សប្តាហ៍ប្រឡងឆមាស' && (await events.innerText()).includes('សូមមកទាន់ពេល'));
  await addEvent('ក', 5, 2, null);
  await modalSave();
  await modal.locator('.field-error', { hasText: t('validation.END_BEFORE_START') }).waitFor({ timeout: 10_000 });
  check('P4-5 an event that ends before it starts is refused next to the field and the form stays open', (await modal.count()) === 1);
  await modal.getByRole('button', { name: t('common.cancel'), exact: true }).click();
  await modal.waitFor({ state: 'detached', timeout: 10_000 });
  await events.locator('[data-event="ថ្ងៃឈប់សម្រាក"]').getByRole('button', { name: t('common.edit'), exact: true }).click();
  await modal.locator('input[id^="field-titleKm-"]').fill('ថ្ងៃឈប់សម្រាកជាតិ');
  check('P4-6 editing an event answers 200', (await putOk('/school-events/', () => modalSave())) === 200);
  await events.locator('[data-event="ថ្ងៃឈប់សម្រាកជាតិ"]').waitFor({ timeout: 15_000 });
  await events.locator('[data-event="ថ្ងៃឈប់សម្រាកជាតិ"]').getByRole('button', { name: t('common.delete'), exact: true }).click();
  await modal.getByRole('button', { name: t('common.delete'), exact: true }).click();
  await events.locator('[data-event="ថ្ងៃឈប់សម្រាកជាតិ"]').waitFor({ state: 'detached', timeout: 15_000 });
  check('P4-7 a deleted event is gone and the other one stays', (await events.locator('li[data-event]').count()) === 1 && (await events.locator('[data-event="សប្តាហ៍ប្រឡងឆមាស"]').count()) === 1);
  await page.waitForTimeout(600);   // let the closing dialog finish fading
  await shot('07a-dashboard');

  // Settings -> printed reports: Khmer digits and the national header, on a report card
  await goTo('/settings/reports', heading(t('reportOptions.title')));
  await page.locator('#opt-numerals').check();
  await page.locator('#opt-header').check();
  await page.locator('#opt-line-3').fill('ខេត្តកណ្តាល');
  check('P4-8 the settings page previews the header lines and Khmer digits before saving', (await page.locator('[data-testid=header-preview]').innerText()).includes('ខេត្តកណ្តាល') && /[០-៩]/.test(await page.locator('[data-testid=numerals-sample]').innerText()));
  check('P4-9 saving the printed-report options answers 200', (await putOk('/settings/app', () => button(t('common.save')).click())) === 200);
  await shot('07b-report-options');
  await goTo('/report-cards', heading(t('reportCards.title')));
  await page.locator('[data-testid=cards-table] tbody tr', { hasText: P1 }).getByRole('link', { name: t('print.print') }).click();
  await page.locator('.report-card').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(800);
  const cardText = await page.locator('.report-card').first().innerText();
  check('P4-10 with both options on, the card shows the national header and Khmer digits only (no Arabic digits)',
    cardText.includes('ព្រះរាជាណាចក្រកម្ពុជា') && cardText.includes('ជាតិ សាសនា ព្រះមហាក្សត្រ') && cardText.includes('ខេត្តកណ្តាល') && /[០-៩]/.test(cardText) && !/[0-9]/.test(cardText), cardText.replace(/\s+/g, ' ').slice(0, 130));
  check('P4-11 ...while the toolbar (which is not printed) keeps Arabic digits', /[0-9]/.test(await page.locator('[data-testid=card-count]').innerText()));
  await elementShot(page.locator('.report-card').first(), 'app-07c-card-national-header.png');
  const nationalPdf = await savePdfTo(path.join(outDir, 'app-card-national.pdf'));
  check('P4-12 that card is saved as a one-page A4 PDF', nationalPdf.subarray(0, 5).toString() === '%PDF-' && pdfPages(nationalPdf) === 1, `${pdfPages(nationalPdf)} page(s)`);
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();   // the print page has no menu
  await heading(t('reportCards.title')).waitFor({ timeout: 15_000 });
  await goTo('/settings/reports', heading(t('reportOptions.title')));
  await page.locator('#opt-numerals').uncheck();
  await page.locator('#opt-header').uncheck();
  await page.locator('#opt-line-3').fill('');
  await putOk('/settings/app', () => button(t('common.save')).click());

  // reports: pick one, preview it, save it as PDF and Excel
  await goTo('/reports', heading(t('reports.title')));
  const pickReport = (key) => page.locator(`label.report-choice:has(input[data-report="${key}"])`).click();
  await page.locator('input[data-report]').first().waitFor({ state: 'attached', timeout: 15_000 });   // the list appears once the page has loaded
  check('P4-13 the fee report is not offered while fees are off (the five other reports and the three homework ones are)', (await page.locator('input[data-report="fees"]').count()) === 0 && (await page.locator('input[data-report]').count()) === 8);
  await pickReport('results');
  await page.locator('#report-exam').waitFor();
  await page.locator('[data-testid=report-preview]').click();
  await page.locator('[data-testid=report-sheet] tbody tr').first().waitFor({ timeout: 15_000 });
  let rowsOfSheet = await sheetRows();
  check('P4-14 the results sheet is in rank order with the percentages, bands and the absent note',
    rowsOfSheet.map((r) => r[2]).join('|') === [P3, P1, P2].join('|') && rowsOfSheet.map((r) => r[0]).join('|') === '1|2|3'
    && rowsOfSheet[0][7] === '100' && rowsOfSheet[1][7] === '89.76' && rowsOfSheet[2][7] === '52.86'
    && rowsOfSheet[1][8] === 'B · ល្អណាស់' && rowsOfSheet[2][3] === '' && rowsOfSheet[2][4] === '55.5' && rowsOfSheet[2].at(-1).includes('ភាសាខ្មែរ'), JSON.stringify(rowsOfSheet[2]));
  await shot('07d-report-results');
  await page.locator('#results-order').selectOption('name');
  await page.waitForFunction((first) => document.querySelector('[data-testid=report-sheet] tbody tr td:nth-child(3)')?.textContent?.trim() === first, P3, { timeout: 15_000 });
  rowsOfSheet = await sheetRows();
  check('P4-15 switching to name order lists the students alphabetically (and no rank is lost)', rowsOfSheet.map((r) => r[2]).join('|') === khmerOrder.join('|') && rowsOfSheet.map((r) => r[0]).join('|') === '1|3|2', rowsOfSheet.map((r) => r[2]).join('|'));
  const xlsxBytes = await saveXlsx(path.join(outDir, 'app-report-results.xlsx'));
  const strings = unzipEntry(xlsxBytes, 'xl/sharedStrings.xml').toString('utf8');
  const sheetXml = unzipEntry(xlsxBytes, 'xl/worksheets/sheet1.xml').toString('utf8');
  check('P4-16 the Excel file is the same table: the title, the Khmer names, and real numbers (100, 89.76, 52.86)',
    xlsxBytes.subarray(0, 2).toString() === 'PK' && strings.includes(t('reports.results.title')) && strings.includes(P1) && strings.includes(SCHOOL) && [/<v>100(\.0)?<\/v>/, /<v>89\.76<\/v>/, /<v>52\.86<\/v>/].every((re) => re.test(sheetXml)),
    `${xlsxBytes.length} bytes`);
  const resultsPdf = await savePdfTo(path.join(outDir, 'app-report-results.pdf'));
  check('P4-17 the results sheet is saved as a one-page A4 PDF', resultsPdf.subarray(0, 5).toString() === '%PDF-' && pdfPages(resultsPdf) === 1, `${pdfPages(resultsPdf)} page(s)`);
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('reports.title')).waitFor({ timeout: 15_000 });

  await page.locator('#report-status').selectOption('ACTIVE');
  await page.locator('[data-testid=report-preview]').click();
  await page.locator('[data-testid=report-sheet] tbody tr').first().waitFor({ timeout: 15_000 });
  rowsOfSheet = await sheetRows();
  check('P4-18 the student list report shows the 5 active students in Khmer order, with the count in its subtitle',
    rowsOfSheet.length === 5 && rowsOfSheet.some((r) => r[2] === P1) && (await page.locator('[data-testid=report-sheet] .report-sub').innerText()).includes(t('students.count').replace('{n}', '5')), `${rowsOfSheet.length} rows`);
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('reports.title')).waitFor({ timeout: 15_000 });
  await pickReport('roster');
  await page.locator('[data-testid=report-preview]').click();
  await page.locator('[data-testid=report-sheet] tbody tr').first().waitFor({ timeout: 15_000 });
  rowsOfSheet = await sheetRows();
  check('P4-19 the class roster lists the three students of the class', rowsOfSheet.map((r) => r[2]).join('|') === khmerOrder.join('|'), rowsOfSheet.map((r) => r[2]).join('|'));
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('reports.title')).waitFor({ timeout: 15_000 });
  await pickReport('attendance');
  await page.locator('[data-testid=report-preview]').click();
  await page.locator('[data-testid=report-sheet] tbody tr').first().waitFor({ timeout: 15_000 });
  rowsOfSheet = await sheetRows();
  const absentRow = rowsOfSheet.find((r) => r[2] === P2);
  check('P4-20 the attendance report counts days: the absent student has 0 present, 0 late, 0 partial, 1 absent, 0 on leave in 1 day', absentRow?.slice(3).join(',') === '0,0,0,1,0,1', absentRow?.join(','));
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('reports.title')).waitFor({ timeout: 15_000 });
  await pickReport('teachers');
  await page.locator('[data-testid=report-preview]').click();
  await page.locator('[data-testid=report-sheet] tbody tr').first().waitFor({ timeout: 15_000 });
  rowsOfSheet = await sheetRows();
  check('P4-21 the teacher list shows both teachers', rowsOfSheet.length === 2 && rowsOfSheet.some((r) => r[2] === T1) && rowsOfSheet.some((r) => r[2] === T2), `${rowsOfSheet.length} rows`);
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await heading(t('reports.title')).waitFor({ timeout: 15_000 });
  await shot('07e-reports');

  // fees: switched on in Settings (riel first), categories, a charge for the whole class, payments, a void, receipts
  await goTo('/settings/fees', heading(t('fees.settingsTitle')));
  check('P4-22 fees are off by default', !(await page.locator('#fees-enabled').isChecked()) && (await page.locator('[data-testid=fee-categories]').count()) === 0);
  check('P4-23 switching fees on answers 200 and the menu gets a Fees entry', (await putOk('/settings/app', () => page.locator('#fees-enabled').check())) === 200 && (await page.locator('a[href="/fees"]').count()) === 1);
  await page.locator('[data-testid=fee-categories]').waitFor({ timeout: 15_000 });
  const addCategory = async (name, defaultText, currencyLabel) => {
    await button(t('fees.addCategory')).click();
    await modal.locator('input[id^="field-nameKm-"]').fill(name);
    if (currencyLabel) await selectField('currency', modal).selectOption({ label: currencyLabel });
    if (defaultText) await modal.locator('input[id^="field-defaultAmount-"]').fill(defaultText);
    await modalSave();
    await modal.waitFor({ state: 'detached', timeout: 15_000 });
    await page.locator(`[data-category="${name}"]`).waitFor({ timeout: 15_000 });
  };
  await addCategory(FEE_MONTHLY, '១៥០០០');
  await addCategory(FEE_BOOK, '');
  check('P4-24 a category shows its default amount in riel (typed in Khmer digits), or "ask each time"',
    (await page.locator(`[data-category="${FEE_MONTHLY}"]`).innerText()).includes('15,000៛') && (await page.locator(`[data-category="${FEE_BOOK}"]`).innerText()).includes(t('fees.askEachTime')));
  await page.locator(`[data-category="${FEE_BOOK}"]`).getByRole('button', { name: t('fees.deactivate'), exact: true }).click();
  await page.locator(`[data-category="${FEE_BOOK}"] .badge`, { hasText: t('fees.inactive') }).waitFor({ timeout: 15_000 });
  await page.locator(`[data-category="${FEE_BOOK}"]`).getByRole('button', { name: t('fees.activate'), exact: true }).click();
  await page.locator(`[data-category="${FEE_BOOK}"] .badge`, { hasText: t('fees.active') }).waitFor({ timeout: 15_000 });
  check('P4-25 a category can be deactivated and activated again (never deleted)', true);
  check('P4-26 allowing dollars as well answers 200', (await putOk('/settings/app', () => page.locator('#fees-currencies').selectOption('KHR,USD'))) === 200);
  await page.locator('[data-testid=fees-default-currency]').waitFor({ timeout: 15_000 });
  check('P4-26b with both currencies allowed the settings page offers a preferred currency (D9), riel until the school chooses', (await page.locator('[data-testid=fees-default-currency]').inputValue()) === 'KHR');
  await addCategory(FEE_UNIFORM, '12.5', t('fees.currency.USD'));
  check('P4-27 a dollar category shows dollars and cents', (await page.locator(`[data-category="${FEE_UNIFORM}"]`).innerText()).includes('$12.50'));

  await goTo('/fees', heading(t('fees.title')));
  await page.locator('[data-testid=fees-table] tbody tr[data-student]').first().waitFor({ timeout: 15_000 });
  check('P4-28 the class starts with nobody charged (dashes)', (await page.locator('[data-testid=fees-table] tbody tr[data-student]').count()) === 3 && !(await page.locator('[data-testid=fees-table] tbody').innerText()).includes('៛'));
  const chargeClassOnce = async () => {
    await page.locator('.page-header').getByRole('button', { name: t('fees.chargeClass'), exact: true }).click();
    await pickByText(selectField('categoryId', modal), FEE_MONTHLY);
    await modal.locator('input[id^="field-dueDate-"]').fill(dayOffset(10));
    return postJson('/fees/charges/class', () => modal.getByRole('button', { name: t('fees.chargeClass'), exact: true }).click());
  };
  const first = await chargeClassOnce();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('[data-testid=class-balance]', { hasText: '45,000៛' }).waitFor({ timeout: 15_000 });
  check('P4-29 charging the whole class: 3 students charged 15,000៛ each (45,000៛ due in all)', first.status === 200 && first.body.created === 3 && first.body.skipped === 0, JSON.stringify(first.body));
  const again = await chargeClassOnce();
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  check('P4-30 doing it again charges nobody twice (0 created, 3 skipped; still 45,000៛)', again.body.created === 0 && again.body.skipped === 3 && (await page.locator('[data-testid=class-balance]').innerText()).includes('45,000៛'), JSON.stringify(again.body));
  await page.waitForTimeout(600);
  await shot('07f-fees');

  // one student's account: pay, refuse an overpayment, pay the rest, void, receipts
  await page.locator('[data-testid=fees-table] tbody tr', { hasText: P1 }).locator('a').click();
  await page.locator('[data-testid=charges-table]').waitFor({ timeout: 15_000 });
  const chargeRow = page.locator(`tr[data-charge="${FEE_MONTHLY}"]`);
  const payOpen = async () => { await chargeRow.getByRole('button', { name: t('fees.pay'), exact: true }).click(); await modal.waitFor({ timeout: 10_000 }); };
  await payOpen();
  check('P4-31 the payment form starts with what is still due', (await modal.locator('input[id^="field-amount-"]').inputValue()) === '15000');
  await modal.locator('input[id^="field-amount-"]').fill('5000');
  const pay1 = await postJson('/payments', recordPayment);
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  const year = localIso(new Date()).slice(0, 4);
  check('P4-32 recording 5,000៛ gives receipt number 1 of the year', pay1.status === 201 && pay1.body.receiptNo === `R-${year}-00001`, JSON.stringify(pay1.body));
  await page.locator(`tr[data-receipt="R-${year}-00001"]`).waitFor({ timeout: 15_000 });
  check('P4-33 the account shows 10,000៛ still due', (await page.locator('[data-testid=ledger-balance]').innerText()).includes('10,000៛'));
  await payOpen();
  await modal.locator('input[id^="field-amount-"]').fill('20000');
  await recordPayment();
  await modal.locator('.field-error', { hasText: t('validation.OVERPAYMENT') }).waitFor({ timeout: 10_000 });
  check('P4-34 paying more than is due is refused next to the field and the form stays open', (await modal.count()) === 1);
  await modal.locator('input[id^="field-amount-"]').fill('10000');
  const pay2 = await postJson('/payments', recordPayment);
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  check('P4-35 paying the rest gives receipt 2 and the Pay button is then disabled', pay2.body.receiptNo === `R-${year}-00002` && (await page.locator('[data-testid=ledger-balance]').innerText()).includes('0៛') && (await chargeRow.getByRole('button', { name: t('fees.pay'), exact: true }).isDisabled()));
  const secondRow = page.locator(`tr[data-receipt="R-${year}-00002"]`);
  await secondRow.getByRole('button', { name: t('fees.void'), exact: true }).click();
  await modal.locator('input[id^="field-reason-"]').fill('ព្រីនខុស');
  const voided = await postJson('/void', () => modal.getByRole('button', { name: t('fees.voidConfirm'), exact: true }).click());
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await secondRow.locator('.badge', { hasText: t('fees.voided') }).waitFor({ timeout: 15_000 });
  check('P4-36 voiding receipt 2 (with a reason) keeps it listed as void and the 10,000៛ is owed again',
    voided.status === 200 && (await secondRow.innerText()).includes('ព្រីនខុស') && (await page.locator('[data-testid=ledger-balance]').innerText()).includes('10,000៛') && (await secondRow.getByRole('button', { name: t('fees.void'), exact: true }).count()) === 0);
  await page.waitForTimeout(600);
  await shot('07g-ledger');
  await secondRow.getByRole('link', { name: t('fees.receipt') }).click();
  await page.locator('[data-testid=receipt-sheet]').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const voidReceipt = await page.locator('[data-testid=receipt-sheet]').innerText();
  check('P4-37 the voided receipt prints stamped VOID, with its number, the student and the reason', (await page.locator('[data-testid=receipt-void]').count()) === 1 && voidReceipt.includes(`R-${year}-00002`) && voidReceipt.includes(P1) && voidReceipt.includes('ព្រីនខុស'));
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await page.locator('[data-testid=charges-table]').waitFor({ timeout: 15_000 });
  await page.locator(`tr[data-receipt="R-${year}-00001"]`).getByRole('link', { name: t('fees.receipt') }).click();
  await page.locator('[data-testid=receipt-sheet]').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const receipt1 = await page.locator('[data-testid=receipt-sheet]').innerText();
  check('P4-38 receipt 1 shows 5,000៛ paid, the monthly fee, and 10,000៛ still due after it', receipt1.includes('5,000៛') && receipt1.includes(FEE_MONTHLY) && receipt1.includes('10,000៛') && (await page.locator('[data-testid=receipt-void]').count()) === 0, receipt1.replace(/\s+/g, ' ').slice(0, 140));
  await elementShot(page.locator('[data-testid=receipt-sheet]'), 'app-07h-receipt.png');
  const receiptPdf = await savePdfTo(path.join(outDir, 'app-receipt.pdf'));
  check('P4-39 the receipt is saved as a one-page A4 PDF', receiptPdf.subarray(0, 5).toString() === '%PDF-' && pdfPages(receiptPdf) === 1, `${pdfPages(receiptPdf)} page(s)`);
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await page.locator('[data-testid=charges-table]').waitFor({ timeout: 15_000 });

  // another student's charge is deleted, a third one is changed and given a dollar fee
  await goTo('/fees', heading(t('fees.title')));
  await page.locator('[data-testid=fees-table] tbody tr', { hasText: P3 }).locator('a').click();
  await page.locator(`tr[data-charge="${FEE_MONTHLY}"]`).waitFor({ timeout: 15_000 });
  await page.locator(`tr[data-charge="${FEE_MONTHLY}"]`).getByRole('button', { name: t('common.delete'), exact: true }).click();
  await modal.getByRole('button', { name: t('common.delete'), exact: true }).click();
  await page.locator(`tr[data-charge="${FEE_MONTHLY}"]`).waitFor({ state: 'detached', timeout: 15_000 });
  check('P4-40 a charge nobody paid can be deleted', (await page.locator('[data-testid=ledger-totals]').innerText()).includes(t('fees.noCharges')));
  await page.getByRole('link', { name: t('common.back'), exact: true }).first().click();
  await page.locator('[data-testid=fees-table] tbody tr', { hasText: P2 }).locator('a').click();
  await page.locator(`tr[data-charge="${FEE_MONTHLY}"]`).waitFor({ timeout: 15_000 });
  await page.locator(`tr[data-charge="${FEE_MONTHLY}"]`).getByRole('button', { name: t('common.edit'), exact: true }).click();
  await modal.locator('input[id^="field-amount-"]').fill('16000');
  check('P4-41 changing a charge to 16,000៛ answers 200', (await putOk('/fees/charges/', () => modalSave())) === 200);
  await page.locator(`tr[data-charge="${FEE_MONTHLY}"]`, { hasText: '16,000៛' }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: t('fees.addCharge'), exact: true }).click();
  await pickByText(selectField('categoryId', modal), FEE_UNIFORM);
  const usdCharge = await postJson('/fees/charges', () => modalSave());
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator(`tr[data-charge="${FEE_UNIFORM}"]`).waitFor({ timeout: 15_000 });
  check('P4-42 a dollar fee uses the category\'s 12.50 and the account shows riel and dollars side by side',
    usdCharge.status === 201 && (await page.locator(`tr[data-charge="${FEE_UNIFORM}"]`).innerText()).includes('$12.50') && (await page.locator('[data-testid=ledger-totals]').innerText()).includes('16,000៛'));

  // the fee report and the dashboard figure
  await goTo('/reports', heading(t('reports.title')));
  await pickReport('fees');
  await page.locator('[data-testid=report-preview]').click();
  await page.locator('[data-testid=report-sheet] tbody tr').first().waitFor({ timeout: 15_000 });
  rowsOfSheet = await sheetRows();
  const feeHeaders = await page.locator('[data-testid=report-sheet] thead th').allInnerTexts();
  const totalRow = rowsOfSheet.at(-1);
  check('P4-43 the fee report has riel and dollar columns and a class total row (26,000 riel and 12.5 dollars still due)',
    feeHeaders.length === 9 && feeHeaders.some((h) => h.includes('(KHR)')) && feeHeaders.some((h) => h.includes('(USD)')) && totalRow[2] === t('fees.classTotal') && totalRow[5] === '26000' && totalRow[8] === '12.5', JSON.stringify(totalRow));
  await page.getByRole('button', { name: t('common.back'), exact: true }).first().click();
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  const feeCard = await page.locator('[data-testid=fees-outstanding]').innerText();
  check('P4-44 the dashboard shows what is still due: 26,000៛ and $12.50', feeCard.includes('26,000៛') && feeCard.includes('$12.50'), feeCard.replace(/\s+/g, ' '));

  // fees off again: hidden, nothing lost
  await goTo('/settings/fees', heading(t('fees.settingsTitle')));
  await putOk('/settings/app', () => page.locator('#fees-currencies').selectOption('KHR'));
  check('P4-45 switching fees off answers 200 and the Fees entry leaves the menu', (await putOk('/settings/app', () => page.locator('#fees-enabled').uncheck())) === 200 && (await page.locator('a[href="/fees"]').count()) === 0);
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  check('P4-46 ...and the dashboard drops the fee figure', (await page.locator('[data-testid=fees-outstanding]').count()) === 0);

  // a grading scale already used by an examination is frozen: editing it makes a new version, the examination keeps its own
  await goTo('/settings/grading', heading(t('grading.title')));
  const scaleCount = await page.locator('[data-scale]').count();
  const standardName = (await page.locator('[data-scale]').first().getAttribute('data-scale')) ?? '';   // the name alone (the heading also holds the "default" badge)
  await page.locator('[data-scale]').first().getByRole('button', { name: t('common.edit'), exact: true }).click();
  await modal.locator('input[id^="field-passPercent-"]').fill('60');
  check('P4-47 editing the default scale (pass mark 60) answers 200', (await putOk('/grading-scales/', () => modalSave())) === 200);
  await modal.waitFor({ state: 'detached', timeout: 15_000 });
  await page.locator('[data-scale]').first().getByText(t('grading.passMarkIs').replace('{percent}', '60')).waitFor({ timeout: 15_000 });
  check('P4-48 the list still shows the same number of scales (the replaced version is not listed) and explains the versions',
    (await page.locator('[data-scale]').count()) === scaleCount && (await page.locator('[data-testid=grading-version-note]').count()) === 1);
  await goTo('/exams', heading(t('exams.title')));
  await row(EXAM).locator('a').click();
  await heading(EXAM).waitFor({ timeout: 15_000 });
  await page.locator('#exam-tab-results').click();
  await page.locator('[data-testid=results-table] tbody tr[data-student]').first().waitFor({ timeout: 15_000 });
  const p2Outcome = (await page.locator('[data-testid=results-table] tbody tr', { hasText: P2 }).first().locator('td').allInnerTexts()).at(-1)?.trim();
  check('P4-49 the old examination keeps its own scale and pass mark (50 %): student 2 (52.86 %) still passes although the default is now 60 %',
    (await page.locator('[data-testid=results-scale]').innerText()).includes(standardName) && (await page.locator('[data-testid=results-scale]').locator('xpath=..').innerText()).includes(t('exams.passMarkIs').replace('{percent}', '50')) && p2Outcome === t('exams.passed'), `${p2Outcome}`);
  await shot('07i-frozen-results');

  // the student profile: attendance and results
  await openByName(P1);
  await page.locator('[data-testid=student-results]').getByText(EXAM).waitFor({ timeout: 15_000 });
  const resultsCardText = await page.locator('[data-testid=student-results]').innerText();
  const attendanceCardText = await page.locator('[data-testid=student-attendance]').innerText();
  check('P4-50 the profile shows the student\'s result (89.76 %, band B, rank 2) and 1 day of attendance (present)',
    resultsCardText.includes('89.76') && resultsCardText.includes('B · ល្អណាស់') && /\b2\b/.test(resultsCardText) && attendanceCardText.includes(t('students.attendanceBoth').replace('{days}', '1').replace('{sessions}', '1')) && attendanceCardText.includes(`${t('attendance.status.PRESENT')} 1`), `${resultsCardText.replace(/\s+/g, ' ').slice(0, 100)} | ${attendanceCardText.replace(/\s+/g, ' ').slice(0, 80)}`);
  await page.locator('[data-testid=student-results]').scrollIntoViewIfNeeded();
  await shot('07j-profile');

  // ---- 5. System health page: real preload data (memory, printers) + diagnostics export ----
  await page.locator('a[href="/settings/system"]').first().click();
  await page.locator('.health-row').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const sys = await page.locator('main, .app-content').first().innerText();
  const printersRow = (await page.locator('.health-row').allInnerTexts()).some((r) => /PRINTERS|ព្រីន|ម៉ាស៊ីនបោះពុម្ព/i.test(r));
  check('5a the health page shows memory figures from the real preload (Electron + backend)', /\d+\s*MB|\d+\s*មេកាបៃ|MB/.test(sys), '');
  await button(t('health.deepCheck')).click();
  await page.waitForFunction(() => !document.body.innerText.includes('កំពុងពិនិត្យ…'), null, { timeout: 60_000 }).catch(() => {});
  const diag = path.join(outDir, 'app-diagnostics.txt');
  rmSync(diag, { force: true });
  await app.evaluate(({ dialog }, p) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: p }); }, diag);
  const cloneProbe = await page.evaluate(async () => { try { await window.desktop.health.exportDiagnostics(new Proxy({ a: 1 }, {})); return 'accepted'; } catch (e) { return String(e.message).slice(0, 90); } });
  console.log(`      IPC with a Proxy (what a Vue reactive object is): ${cloneProbe}`);
  await button(t('health.exportDiagnostics')).click();
  for (let i = 0; i < 40 && !existsSync(diag); i++) await sleep(250);
  const diagText = existsSync(diag) ? readFileSync(diag, 'utf8') : '';
  if (!diagText) console.log('      desktop.log tail: ' + readFileSync(path.join(data, 'logs', 'desktop.log'), 'utf8').split(/\r?\n/).slice(-8).join(' | ') + ' || console: ' + consoleErrors.join(' | '));
  check('5b diagnostics export writes a file with versions + health + log tails', diagText.includes('electron') && diagText.includes('## health report') && diagText.includes('backend ready'), `${diagText.length} chars`);
  check('5c ...and it contains NO school data, username, password, recovery key or token', !diagText.includes(SCHOOL) && !diagText.includes('admin.sokha') && !diagText.includes(PW) && !diagText.includes(key) && !diagText.replace(/-/g, '').includes(key.replace(/-/g, '')), '');
  await shot('05-system-health');

  // ---- 6. lock / unlock + sign out / sign in ----
  await page.locator('.user-menu-toggle').click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: t('nav.lock') }).first().click();
  await page.locator('.lock-overlay').waitFor();
  await page.locator('.lock-overlay input[type=password]').fill('wrong-password-xx');
  await page.locator('.lock-overlay button[type=submit]').click();
  await page.locator('.lock-overlay .field-error, .lock-overlay [role=alert], .lock-overlay .invalid-feedback').first().waitFor({ timeout: 15_000 });
  await page.locator('.lock-overlay input[type=password]').fill(PW);
  await page.locator('.lock-overlay button[type=submit]').click();
  await page.locator('.lock-overlay').waitFor({ state: 'detached', timeout: 15_000 });
  check('6a lock screen rejects a wrong password and unlocks with the right one', true);
  await page.locator('.user-menu-toggle').click();
  await page.locator('.dropdown-menu .dropdown-item', { hasText: t('nav.signOut') }).first().click();
  await field('username').waitFor({ timeout: 20_000 });
  await field('username').fill('admin.sokha');
  await field('password').fill(PW);
  await button(t('auth.login.submit')).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  check('6b sign out then sign in works', true);

  // ---- 7. after a reload the in-memory session is gone (nothing persisted) ----
  await page.reload();
  await field('username').waitFor({ timeout: 30_000 });
  const stored = await page.evaluate(() => ({ ls: Object.keys(localStorage), ss: Object.keys(sessionStorage), cookie: document.cookie }));
  check('7a reload requires signing in again; nothing is stored in localStorage/sessionStorage/cookies', stored.ls.length === 0 && stored.ss.length === 0 && stored.cookie === '', JSON.stringify(stored));

  // ---- 8. whole-session audit ----
  const csp = await page.evaluate(() => window.__csp);
  const origins = [...requests].sort();
  console.log(`      request origins seen: ${origins.join(', ')}`);
  check('8a only app://school and the local backend were ever contacted (no external request)', origins.every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)), origins.join(', '));
  check('8b no CSP violation across the whole session', csp.length === 0, csp.join(' | '));
  check('8c no console errors or uncaught page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  // ---- 9. quit through the preload; everything stops ----
  const javaPid = Number(readFileSync(path.join(data, 'config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  page.evaluate(() => window.desktop.quit()).catch(() => {});
  let down = false;
  for (let i = 0; i < 60 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('9 quit from the UI stops Electron and the backend', down);
  app = null;
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  try { await shot('FAIL'); } catch { /* ignore */ }
} finally {
  try { if (app) await app.close(); } catch { /* ignore */ }
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${root}\\\\node_modules\\\\*' } | Stop-Process -Force`], { stdio: 'ignore' }); } catch { /* ignore */ }
  await sleep(500);
  try { rmSync(data, { recursive: true, force: true }); } catch { /* ignore */ }
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
