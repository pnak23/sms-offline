// Phase 5 in the REAL Electron shell with the REAL UI and REAL backend (unpackaged: desktop/dist + frontend/.output/public):
// create a backup, copy it to another drive and prove the copy, damage one, change the school, restore through the real dialogs,
// undo the restore, the audit viewer, the performance page, the reminder banner, the exit prompt, and a restore on a NEW PC (setup wizard).
// Needs: npm run backend:build + node scripts/extract-backend.mjs, npm run generate -w frontend, npm run build -w desktop.
// Usage: node desktop/test/e2e-backup.mjs
// Native dialogs cannot be clicked by a script: the folder / file chooser is replaced in the main process by one that answers a path.
// The "another drive" is a folder under this repository (drive E:); the app's data lives in the temp folder (drive C:), which is how
// the shell tells a real second place from the same disk.
import { _electron as electron } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const alive = (pid) => { try { return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid)); } catch { return false; } };
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const PW = 'Khmer-School-Pass-2026';
const SCHOOL_A = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const SCHOOL_B = 'សាលាបឋមសិក្សា ភូមិថ្មី (ឈ្មោះកែ)';
const YEAR_A = '២០២៦-២០២៧';
const YEAR_B = '២០២៧-២០២៨';
const usbDir = path.join(outDir, 'usb ថតបម្រុងទុក');           // drive E: (the repository)
const sameDriveDir = mkdtempSync(path.join(tmpdir(), 'sms c-drive copy '));   // drive C: (the same drive as the app's data)
rmSync(usbDir, { recursive: true, force: true });
mkdirSync(usbDir, { recursive: true });

function launchEnv(data) {
  const env = { ...process.env, SMS_DATA_DIR: data };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/** Starts the app on a data folder and returns the page plus helpers; every check shares the counters above. */
async function open(data) {
  const app = await electron.launch({ executablePath: path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [desktop], env: launchEnv(data), timeout: 120_000 });
  let page;
  const end = Date.now() + 120_000;
  while (!page && Date.now() < end) { page = app.windows().find((w) => w.url().startsWith('app://school')); if (!page) await sleep(300); }
  if (!page) throw new Error('main window did not appear');
  const state = { app, page, consoleErrors: [], consoleLog: [], origins: new Set() };
  page.on('console', (m) => {
    state.consoleLog.push(m.text());
    if (m.type() === 'error' && !/status of 4(01|22|29)\b/.test(m.text())) state.consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => state.consoleErrors.push('pageerror: ' + String(e.message).slice(0, 300)));
  page.on('request', (r) => { if (/^(data|blob):/.test(r.url())) return; const u = new URL(r.url()); state.origins.add(u.protocol + '//' + u.host); });
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`)); });
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  return state;
}

let one;   // the first app
let two;   // the "new PC"
const data1 = mkdtempSync(path.join(tmpdir(), 'sms ទិន្នន័យ១ '));
const data2 = mkdtempSync(path.join(tmpdir(), 'sms ទិន្នន័យ២ '));
const D1 = (...p) => path.join(data1, ...p);
const D2 = (...p) => path.join(data2, ...p);
const zipsIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => /^SchoolBackup_.*\.zip$/.test(n)).sort() : []);
const history = (file) => JSON.parse(readFileSync(file, 'utf8'));

try {
  one = await open(data1);
  let { app, page } = one;
  const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`).first();
  const button = (text) => page.getByRole('button', { name: text, exact: true });
  const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
  const goTo = async (href, waitFor) => { await page.locator(`a[href="${href}"]`).first().click(); await waitFor.waitFor({ timeout: 30_000 }); };
  const modalEl = () => page.locator('.modal.show');   // looked up on whichever window is current
  const toast = (text) => page.locator('.toast-body', { hasText: text });
  const rows = () => page.locator('[data-testid=backup-row]');
  const row = (id) => page.locator(`[data-testid=backup-row][data-backup-id="${id}"]`);
  const pickPath = (target) => app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }); }, target);
  const shot = async (name) => {
    await page.waitForTimeout(600);   // let a modal finish fading in
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = 'none'; }));
    await page.screenshot({ path: path.join(outDir, `backup-${name}.png`) });
    await page.evaluate(() => document.querySelectorAll('.toast-container, .toast').forEach((e) => { e.style.display = ''; }));
  };
  const closeWindow = () => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school')); w?.close(); });
  const signIn = async (pw = PW) => {
    await field('username').waitFor({ timeout: 60_000 });
    await field('username').fill('admin.sokha');
    await field('password').fill(pw);
    await button(t('auth.login.submit')).click();
    await page.waitForURL('**/dashboard', { timeout: 60_000 });
  };

  // ---- 0. a fresh school: the wizard, the school name, one academic year (this is "the school as it is now": state A) ------------------
  await heading(t('setup.welcome.checksTitle')).waitFor({ timeout: 60_000 });
  const welcomeNote = await page.locator('.restore-note').innerText();
  check('P5-0a the welcome step offers "restore from a backup" for real now (an enabled button, no "coming later")', await page.locator('[data-testid=setup-restore]').isEnabled() && !welcomeNote.includes('កំណែបន្ទាប់'), welcomeNote.replace(/\s+/g, ' ').slice(0, 90));
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
  await field('nameKm').fill(SCHOOL_A);
  await button(t('common.saveAndContinue')).click();
  await page.waitForTimeout(800);
  const skipOrNext = async () => { for (const label of [t('common.skipForNow'), t('common.saveAndContinue'), t('common.next')]) { const b = button(label); if (await b.count() && await b.isEnabled().catch(() => false)) { await b.click(); return; } } };
  for (let i = 0; i < 4 && !(await button(t('setup.finish.start')).count()); i++) { await skipOrNext(); await page.waitForTimeout(700); }
  await button(t('setup.finish.start')).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
  await goTo('/settings/academic', heading(t('academic.year.title')));
  const yearForm = page.locator('.year-form');
  const addYear = async (name, start, end) => {
    if (await button(t('academic.year.add')).count()) await button(t('academic.year.add')).click();   // once a year exists the form is folded away
    await yearForm.locator('input[id^="field-nameKm-"]').fill(name);
    await yearForm.locator('input[id^="field-startDate-"]').fill(start);
    await yearForm.locator('input[id^="field-endDate-"]').fill(end);
    await yearForm.getByRole('button', { name: t('academic.year.create'), exact: true }).click();
    await page.locator('tbody tr', { hasText: name }).waitFor({ timeout: 15_000 });
  };
  await addYear(YEAR_A, '2026-11-01', '2027-08-31');
  check('P5-0b state A: the school has its name and one academic year', (await page.locator('.header-school-name').innerText()).includes(SCHOOL_A) && (await page.locator('tbody tr', { hasText: YEAR_A }).count()) === 1);

  // ---- 0c. the dashboard: with no good backup yet it WARNS, offers "back up now", and says what a backup kept on the laptop cannot protect against ----------------------
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  const noneBanner = page.locator('[data-testid=backup-status-BACKUP_AGE]');
  await noneBanner.waitFor({ timeout: 30_000 });
  const noneText = await noneBanner.innerText();
  const noneBox = await noneBanner.boundingBox();
  const noneLook = await noneBanner.evaluate((el) => ({ warningBox: el.classList.contains('alert') && el.classList.contains('alert-warning'), role: el.getAttribute('role') }));
  check('P5-0c no good backup yet: the dashboard shows the yellow warning box (an .alert-warning, role alert; unchanged by the quiet green line) in Khmer with a "back up now" button, the limits note ALWAYS visible (there is no information button), saying a backup on the laptop does not protect against a failed SSD, theft or physical damage',
    (await noneBanner.getAttribute('data-state')) === 'WARN' && noneLook.warningBox && noneLook.role === 'alert' && noneText.includes(t('health.checks.BACKUP_AGE.NO_SUCCESSFUL_BACKUP')) && noneText.includes(t('dashboard.backupLimits'))
    && (await noneBanner.locator('[data-testid=backup-limits-note]').isVisible()) && (await noneBanner.locator('[data-testid=backup-limits-toggle]').count()) === 0
    && (await page.locator('[data-testid=backup-banner-now]').count()) === 1 && (await page.locator('[data-testid=backup-status-EXTERNAL_COPY]').count()) === 0,
    noneText.replace(/\s+/g, ' ').slice(0, 100));

  // ---- 1. the backup page: nothing yet, then a backup that is read back before it is reported ------------------------------------
  await goTo('/settings/backup', page.locator('[data-testid=backup-page]'));
  await page.locator('[data-testid=backup-empty]').waitFor({ timeout: 15_000 });
  const note = await page.locator('.alert-info').first().innerText();
  check('P5-1a with no backup the page says so, shows the honest "same disk is not safe / not encrypted" note, and offers all three actions',
    (await page.locator('[data-testid=backup-empty]').innerText()).includes('មិនទាន់មានការបម្រុងទុក') && note.includes('មិនត្រូវបានអ៊ិនគ្រីប') && (await page.locator('[data-testid=create-backup]').isEnabled()) && (await page.locator('[data-testid=restore-from-file]').isEnabled()), note.slice(0, 60));
  check('P5-1b the summary says an automatic backup is due when the program closes', (await page.locator('[data-testid=backup-summary]').innerText()).includes(t('backup.summary.autoDue')));
  const pageLimits = await page.locator('[data-testid=backup-limits]').innerText();
  check('P5-1c with no backup the page warns at the top (no good backup yet) and explains in Khmer that backups kept on the laptop do not protect against a failed SSD, theft or physical damage, and that a USB copy is optional',
    (await page.locator('[data-testid=backup-status]').getAttribute('data-state')) === 'NONE' && (await page.locator('[data-testid=backup-status]').innerText()).includes(t('backup.status.NONE'))
    && pageLimits.includes(t('backup.limits.ssd')) && pageLimits.includes(t('backup.limits.theft')) && pageLimits.includes(t('backup.limits.damage')) && pageLimits.includes(t('backup.limits.usb')));
  await shot('01-empty');
  await page.locator('[data-testid=create-backup]').click();
  await rows().first().waitFor({ timeout: 60_000 });
  const id1 = await rows().first().getAttribute('data-backup-id');
  check('P5-2a creating a backup lists it as manual and verified', (await rows().count()) === 1 && (await row(id1).getAttribute('data-kind')) === 'MANUAL' && (await row(id1).locator('[data-status=verified]').count()) === 1, id1);
  check('P5-2b the file is a zip in the backups folder (not auto), named SchoolBackup_date_time, and the history is a file outside the database',
    /^SchoolBackup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(id1) && zipsIn(D1('backups')).length === 1 && existsSync(D1('config', 'backup-history.json')) && history(D1('config', 'backup-history.json')).entries.length === 1);
  check('P5-2c the delete button is disabled: this is the last verified backup (a good one must always remain)', await page.locator(`[data-testid="delete-${id1}"]`).isDisabled());
  await shot('02-one-backup');
  check('P5-2d with a good backup less than a day old the page says so (green) and gives its date', (await page.locator('[data-testid=backup-status]').getAttribute('data-state')) === 'OK' && (await page.locator('[data-testid=backup-status]').innerText()).includes(t('backup.status.OK')));
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  const okBanner = page.locator('[data-testid=backup-status-BACKUP_AGE]');
  await okBanner.waitFor({ timeout: 30_000 });
  // the quiet line (the owner, 2026-11-06): a good backup is one line with a check mark, no coloured box; the limits of a laptop-only backup open from an information button
  const okNote = okBanner.locator('[data-testid=backup-limits-note]');
  const okToggle = okBanner.locator('[data-testid=backup-limits-toggle]');
  const okBox = await okBanner.boundingBox();
  const okLook = await okBanner.evaluate((el) => ({ alertBox: el.classList.contains('alert') || !!el.querySelector('.alert'), background: getComputedStyle(el).backgroundColor, role: el.getAttribute('role') }));
  const okInner = await okBanner.innerText();
  check('P5-2e a good backup less than a day old: the dashboard shows a QUIET line, not a coloured box (no .alert, a transparent background, at most two text rows high and much lower than the yellow box), the Khmer title, a link to the Backup page, no "back up now" button, and the limits note is HIDDEN by default',
    (await okBanner.getAttribute('data-state')) === 'OK' && !okLook.alertBox && okLook.background === 'rgba(0, 0, 0, 0)' && okLook.role === 'status' && okBox.height <= 72 && okBox.height < noneBox.height / 1.5
    && okInner.includes(t('dashboard.backupOkTitle')) && (await okBanner.locator('[data-testid=backup-banner-link]').getAttribute('href')) === '/settings/backup'
    && (await page.locator('[data-testid=backup-banner-now]').count()) === 0 && !(await okNote.isVisible()) && !okInner.includes(t('dashboard.backupLimits')),
    `quiet line ${Math.round(okBox.height)} px high, the yellow box was ${Math.round(noneBox.height)} px`);
  const toggleBox = await okToggle.boundingBox();
  check('P5-2f the information button is clearly labelled (an icon and the new Khmer words), is a real button, starts with aria-expanded="false", points with aria-controls at the hidden note, can be reached with Tab (tabindex 0), and is at least 32 px high and 44 px wide to touch',
    (await okToggle.evaluate((el) => el.tagName)) === 'BUTTON' && (await okToggle.innerText()).trim() === t('dashboard.backupLimitsToggle') && (await okToggle.locator('svg').count()) === 1
    && (await okToggle.getAttribute('aria-expanded')) === 'false' && !!(await okToggle.getAttribute('aria-controls')) && (await okToggle.getAttribute('aria-controls')) === (await okNote.getAttribute('id'))
    && (await okToggle.evaluate((el) => el.tabIndex)) === 0 && toggleBox.height >= 32 && toggleBox.width >= 44,
    `${Math.round(toggleBox.width)} x ${Math.round(toggleBox.height)} px`);
  await okToggle.focus();
  await page.keyboard.press('Enter');
  await okNote.waitFor({ state: 'visible', timeout: 5_000 });
  const keyOpened = (await okToggle.getAttribute('aria-expanded')) === 'true';
  const shownLimits = (await okNote.innerText()).trim();
  await shot('02e-dashboard-green-open');
  await page.keyboard.press('Space');
  await okNote.waitFor({ state: 'hidden', timeout: 5_000 });
  const keyClosed = (await okToggle.getAttribute('aria-expanded')) === 'false';
  check('P5-2g with the keyboard alone (Enter opens, Space closes) the button expands the COMPLETE existing sentence: a backup kept only on the laptop does not protect against a failed SSD, a lost or stolen laptop, or physical damage; aria-expanded follows it',
    keyOpened && keyClosed && shownLimits === t('dashboard.backupLimits') && ['SSD', 'លួច', 'កុំព្យូទ័រ', 'រូបវន្ត'].every((word) => shownLimits.includes(word)), shownLimits);
  await shot('02e-dashboard-green-closed');
  // a finger: a real touch event sent through the browser (not a mouse click)
  let touchOpened = false;
  try {
    const cdp = await page.context().newCDPSession(page);
    const at = await okToggle.boundingBox();
    const point = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await okNote.waitFor({ state: 'visible', timeout: 5_000 });
    touchOpened = (await okToggle.getAttribute('aria-expanded')) === 'true';
  } catch (raised) { console.log('   (touch tap not delivered: ' + String(raised).slice(0, 120) + ')'); }
  check('P5-2h a finger tap (a real touch event, not a mouse click) opens the note too, and a mouse click closes it again', touchOpened);
  await okToggle.click();
  await okNote.waitFor({ state: 'hidden', timeout: 5_000 });
  // the narrowest window the program allows (880 px wide, the side menu folded by itself): the quiet line may wrap onto a second row, but nothing is cut off and the page never scrolls sideways
  const mainWindow = (body, arg) => app.evaluate(({ BrowserWindow }, p) => {
    const win = BrowserWindow.getAllWindows().find((x) => !x.isDestroyed() && x.webContents.getURL().startsWith('app://school'));
    return new Function('win', 'a', p.body)(win, p.arg);
  }, { body, arg });
  const windowBefore = await mainWindow('return { maximized: win.isMaximized(), min: win.getMinimumSize(), content: win.getContentSize() };');
  await mainWindow('win.setMinimumSize(0, 0); win.unmaximize(); win.setContentSize(a.w, a.h);', { w: 880, h: 640 });
  await page.waitForFunction(() => window.innerWidth <= 900, null, { timeout: 10_000 });
  await okToggle.click();
  await okNote.waitFor({ state: 'visible', timeout: 5_000 });
  const narrow = await page.evaluate(() => {
    const line = document.querySelector('[data-testid=backup-status-BACKUP_AGE]');
    const box = line.getBoundingClientRect();
    const parts = [...line.querySelectorAll('button, a, svg, .backup-line-note')].map((el) => el.getBoundingClientRect());
    return {
      width: window.innerWidth, lineHeight: Math.round(box.height), lineRight: Math.round(box.right),
      cutOff: parts.filter((b) => b.right > box.right + 1 || b.right > window.innerWidth || b.left < 0).length,
      pageScrollsSideways: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth,
    };
  });
  await shot('02e-dashboard-green-880-open');
  check('P5-2j at the narrowest window (880 px) the quiet line is still whole: the button, the link and the opened note are all inside the window, nothing is cut off and the page does not scroll sideways',
    narrow.width <= 900 && narrow.cutOff === 0 && !narrow.pageScrollsSideways && narrow.lineHeight <= 200, JSON.stringify(narrow));
  await okToggle.click();
  await okNote.waitFor({ state: 'hidden', timeout: 5_000 });
  await shot('02e-dashboard-green-880-closed');
  await mainWindow('win.setMinimumSize(a.min[0], a.min[1]); win.setContentSize(a.content[0], a.content[1]); if (a.maximized) win.maximize();', windowBefore);
  await page.waitForFunction(() => window.innerWidth > 900, null, { timeout: 10_000 }).catch(() => {});
  // the warning is unchanged when the newest good backup is 30 hours old: the health answer is replaced on its way to the page (a display test: the 24-hour rule itself is the backend's, BackendFlowTest)
  const staleHealth = { status: 'WARN', generatedAt: new Date().toISOString(), checks: [{ id: 'BACKUP_AGE', status: 'WARN', code: 'BACKUP_OLD', params: { hours: 30, lastAt: new Date(Date.now() - 30 * 3_600_000).toISOString() }, durationMs: 1 }] };
  const staleRoute = async (route) => {
    const request = route.request();
    const cors = { 'access-control-allow-origin': request.headers().origin ?? '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS', vary: 'Origin' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: cors }); return; }
    await route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(staleHealth) });
  };
  await page.route('**/api/v1/system/health', staleRoute);
  await goTo('/settings/backup', page.locator('[data-testid=backup-page]'));
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  await page.waitForFunction(() => document.querySelector('[data-testid=backup-status-BACKUP_AGE]')?.getAttribute('data-state') === 'WARN', null, { timeout: 15_000 });
  const oldBanner = page.locator('[data-testid=backup-status-BACKUP_AGE]');
  const oldText = await oldBanner.innerText();
  const oldLook = await oldBanner.evaluate((el) => ({ warningBox: el.classList.contains('alert') && el.classList.contains('alert-warning'), role: el.getAttribute('role') }));
  check('P5-2i a newest good backup 30 hours old: the yellow warning is unchanged (an .alert-warning, role alert, the Khmer title and message with the 30 hours, the limits note ALWAYS visible, the "back up now" button, no information button, no quiet line)',
    oldLook.warningBox && oldLook.role === 'alert' && oldText.includes(t('dashboard.backupTitle')) && oldText.includes('30') && oldText.includes(t('dashboard.backupLimits'))
    && (await oldBanner.locator('[data-testid=backup-limits-note]').isVisible()) && (await oldBanner.locator('[data-testid=backup-limits-toggle]').count()) === 0
    && (await page.locator('[data-testid=backup-banner-now]').count()) === 1 && (await page.locator('.backup-line').count()) === 0,
    oldText.replace(/\s+/g, ' ').slice(0, 100));
  await shot('02e-dashboard-yellow-old');
  await page.unroute('**/api/v1/system/health', staleRoute);
  await goTo('/settings/backup', page.locator('[data-testid=backup-page]'));
  await rows().first().waitFor({ timeout: 30_000 });

  // ---- 2. copy to another drive: proved by its hash and recorded; a copy on the same drive is not counted ---------------------------
  await pickPath(usbDir);
  await page.locator(`[data-testid="copy-${id1}"]`).click();
  await toast('usb ថតបម្រុងទុក').first().waitFor({ timeout: 60_000 });
  const copy1 = path.join(usbDir, `${id1}.zip`);
  check('P5-3a the copy on the other drive is byte for byte the original (SHA-256 equal) and the toast names the folder', existsSync(copy1) && sha(copy1) === sha(D1('backups', `${id1}.zip`)));
  await page.waitForFunction((id) => document.querySelector(`[data-backup-id="${id}"] [data-col=copy]`)?.textContent.trim() !== '—', id1, { timeout: 15_000 });
  const h1 = history(D1('config', 'backup-history.json'));
  check('P5-3b the copy is recorded: the row shows its date and the history keeps "last copy elsewhere"', !!h1.lastExternalCopyAt && !!h1.entries[0].externalCopyAt);
  check('P5-3c the summary no longer says "never copied"', !(await page.locator('[data-testid=summary-copy]').innerText()).includes(t('backup.summary.neverCopied')));

  await page.locator('[data-testid=create-backup]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=backup-row]').length === 2, null, { timeout: 60_000 });
  const ids = await rows().evaluateAll((trs) => trs.map((tr) => tr.getAttribute('data-backup-id')));
  const id2 = ids.find((i) => i !== id1);
  await pickPath(sameDriveDir);
  await page.locator(`[data-testid="copy-${id2}"]`).click();
  await toast(t('backup.copy.sameDrive').split('{folder}')[1].slice(0, 12)).first().waitFor({ timeout: 60_000 });
  check('P5-4a a copy on the SAME drive as the data is made and verified but is NOT counted as a copy elsewhere (warning shown, row stays empty)',
    existsSync(path.join(sameDriveDir, `${id2}.zip`)) && (await row(id2).locator('[data-col=copy]').innerText()).trim() === '—' && !history(D1('config', 'backup-history.json')).entries.find((e) => e.fileName === `${id2}.zip`).externalCopyAt);

  const before = zipsIn(D1('backups')).length;
  await pickPath(D1('backups'));
  await page.locator(`[data-testid="copy-${id2}"]`).click();
  await toast(t('backup.copy.reason.SAME_FOLDER')).first().waitFor({ timeout: 30_000 });
  check('P5-4b choosing the program\'s own backups folder as the destination is refused, and nothing is written', zipsIn(D1('backups')).length === before);

  // ---- 3. a damaged backup is found, shown as damaged and can be removed; the last good one is protected -----------------------------
  const zipBytes = readFileSync(D1('backups', `${id1}.zip`));
  zipBytes[Math.floor(zipBytes.length / 2)] ^= 0x33;
  writeFileSync(D1('backups', `${id1}.zip`), zipBytes);
  await page.locator(`[data-testid="verify-${id1}"]`).click();
  await row(id1).locator('[data-status=damaged]').waitFor({ timeout: 30_000 });
  check('P5-5a checking a backup whose file was damaged marks it damaged, says so, and takes it off the restore list', await toast(t('backup.verifyBad')).count() >= 1 && await page.locator(`[data-testid="restore-${id1}"]`).isDisabled());
  await shot('03-damaged');
  await page.locator(`[data-testid="delete-${id1}"]`).click();
  await modalEl().getByRole('button', { name: t('common.delete'), exact: true }).click();
  await row(id1).waitFor({ state: 'detached', timeout: 15_000 });
  check('P5-5b the damaged backup is deleted (the file is gone) and the other one cannot be (it is the last good one)', !existsSync(D1('backups', `${id1}.zip`)) && (await page.locator(`[data-testid="delete-${id2}"]`).isDisabled()));

  // ---- 4. the school changes (state B) ----------------------------------------------------------------------------------------------
  await goTo('/settings/school', heading(t('settings.school.title')));
  await field('nameKm').fill(SCHOOL_B);
  await button(t('common.save')).click();
  await page.locator('.header-school-name').filter({ hasText: '(ឈ្មោះកែ)' }).waitFor({ timeout: 15_000 });
  await goTo('/settings/academic', heading(t('academic.year.title')));
  await addYear(YEAR_B, '2027-11-01', '2028-08-31');
  check('P5-6 state B: the school was renamed and has a second academic year', (await page.locator('.header-school-name').innerText()).includes('(ឈ្មោះកែ)') && (await page.locator('tbody tr', { hasText: YEAR_B }).count()) === 1);

  // ---- 5. restore state A from the copy on the other drive: choose, check, read what it holds, confirm, restart, sign in ---------------
  await goTo('/settings/backup', page.locator('[data-testid=backup-page]'));
  await pickPath(copy1);
  await page.locator('[data-testid=restore-from-file]').click();
  await modalEl().locator('[data-testid=restore-dialog][data-step=pick]').waitFor({ timeout: 15_000 });
  await modalEl().locator('[data-testid=restore-choose]').click();
  await modalEl().locator('[data-testid=restore-dialog][data-step=review]').waitFor({ timeout: 60_000 });
  const facts = await modalEl().locator('[data-testid=restore-facts] dd').allInnerTexts();
  const warning = await modalEl().locator('.alert-warning').innerText();
  check('P5-7a the file is checked completely and the dialog shows what it holds (date, counts, size) before anything is replaced', facts.length === 6 && /\d/.test(facts[0]) && (facts[5].includes('KB') || facts[5].includes('MB')), facts.join(' | '));
  check('P5-7b the dialog warns that the program backs up the current data first, that the password and recovery key revert to the backup\'s, and that the program restarts',
    warning.includes(t('backup.restore.warnReplace').slice(0, 30)) && (await modalEl().locator('[data-testid=restore-credentials-warning]').innerText()) === t('backup.restore.warnCredentials') && warning.includes(t('backup.restore.warnRestart')));
  check('P5-7c until the user confirms, nothing is replaced: the school still has its new name', (await page.locator('.header-school-name').innerText()).includes('(ឈ្មោះកែ)') && existsSync(D1('backups', 'restore-pending', 'restore.json')));
  await shot('04-restore-review');
  await modalEl().locator('[data-testid=restore-confirm]').click();
  await page.locator('[data-testid=restored-notice]').waitFor({ timeout: 120_000 });
  check('P5-8a after the restore the program restarted and the page reloaded to the sign-in screen with the "restored" notice', page.url().includes('/login'), page.url());
  await signIn();
  await page.locator('.header-school-name').filter({ hasText: SCHOOL_A }).waitFor({ timeout: 30_000 });
  check('P5-8b state A is back: the school has its OLD name', !(await page.locator('.header-school-name').innerText()).includes('(ឈ្មោះកែ)'));
  await goTo('/settings/academic', heading(t('academic.year.title')));
  await page.locator('tbody tr', { hasText: YEAR_A }).waitFor({ timeout: 15_000 });   // the heading shows before the list has loaded
  check('P5-8c ...and only the first academic year (the second one was made after the backup)', (await page.locator('tbody tr', { hasText: YEAR_A }).count()) === 1 && (await page.locator('tbody tr', { hasText: YEAR_B }).count()) === 0);
  await goTo('/settings/backup', page.locator('[data-testid=backup-page]'));
  await page.locator('[data-testid=last-restore]').waitFor({ timeout: 15_000 });
  const safetyRow = page.locator('[data-testid=backup-row][data-kind=PRE_RESTORE]');
  check('P5-9a the page says how the restore ended (success, and that the replaced data was backed up first)', (await page.locator('[data-testid=last-restore]').innerText()).includes(t('backup.lastRestore.safety')));
  check('P5-9b the safety backup of the replaced data is listed as "before restore" and is verified', (await safetyRow.count()) === 1 && (await safetyRow.locator('[data-status=verified]').count()) === 1);
  await shot('05-after-restore');

  // ---- 6. the audit viewer ------------------------------------------------------------------------------------------------------------
  await goTo('/settings/audit', page.locator('[data-testid=audit-page]'));
  await page.locator('[data-testid=audit-row]').first().waitFor({ timeout: 15_000 });
  const first = page.locator('[data-testid=audit-row]').first();
  check('P5-10a the newest entry is the restore, with its Khmer label (the restored database wrote it down)', (await first.getAttribute('data-action')) === 'RESTORE_APPLIED' && (await first.innerText()).includes(t('audit.action.RESTORE_APPLIED')));
  check('P5-10b entries are in Khmer: who, what happened, about what', (await page.locator('[data-testid=audit-row]').filter({ hasText: t('audit.action.ACADEMIC_YEAR_CREATED') }).count()) === 1 && (await page.locator('[data-testid=audit-row]').filter({ hasText: t('audit.entity.academic_year') }).count()) >= 1);
  await page.locator('#audit-action').selectOption('ACADEMIC_YEAR_CREATED');
  await page.locator('[data-testid=audit-apply]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=audit-row]').length === 1, null, { timeout: 15_000 });
  check('P5-10c filtering by action shows only that action', (await page.locator('[data-testid=audit-row]').first().getAttribute('data-action')) === 'ACADEMIC_YEAR_CREATED');
  await page.locator('#audit-from').fill('2030-01-02');
  await page.locator('#audit-to').fill('2030-01-01');
  check('P5-10d a start day after the end day is refused on the page', (await page.locator('[data-testid=audit-apply]').isDisabled()) && (await page.locator('main').innerText()).includes(t('audit.filter.rangeInvalid')));
  await page.locator('[data-testid=audit-reset]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid=audit-row]').length > 3, null, { timeout: 15_000 });
  check('P5-10e clearing the filters shows everything again, and nothing on the page can edit or delete an entry', (await page.locator('[data-testid=audit-table] button, [data-testid=audit-table] input').count()) === 0);
  await shot('06-audit');

  // ---- 7. undo the restore from the safety backup (no file dialog: it is in the list) -----------------------------------------------
  await goTo('/settings/backup', page.locator('[data-testid=backup-page]'));
  const safetyId = await safetyRow.first().getAttribute('data-backup-id');
  await page.locator(`[data-testid="restore-${safetyId}"]`).click();
  await modalEl().locator('[data-testid=restore-dialog][data-step=review]').waitFor({ timeout: 60_000 });
  await modalEl().locator('[data-testid=restore-confirm]').click();
  await page.locator('[data-testid=restored-notice]').waitFor({ timeout: 120_000 });
  await signIn();
  await page.locator('.header-school-name').filter({ hasText: '(ឈ្មោះកែ)' }).waitFor({ timeout: 30_000 });
  await goTo('/settings/academic', heading(t('academic.year.title')));
  await page.locator('tbody tr', { hasText: YEAR_A }).waitFor({ timeout: 15_000 });   // the heading shows before the list has loaded
  await page.locator('tbody tr', { hasText: YEAR_B }).waitFor({ timeout: 15_000 });
  check('P5-11 restoring the safety backup undoes the restore: the new name and the second year are back', (await page.locator('tbody tr', { hasText: YEAR_B }).count()) === 1);

  // ---- 7b. a copy on a USB stick is OPTIONAL: the reminder is off until the school switches it on (here: 7 days, through the preferences page) ----------------------------
  await goTo('/settings/preferences', heading(t('settings.preferences.title')));
  await field('reminderDays').waitFor({ timeout: 15_000 });
  check('P5-11b the reminder to copy a backup to a USB stick is OFF (0) in a fresh school, and the page says where the backups are kept', (await field('reminderDays').inputValue()) === '0' && (await page.locator('[data-testid=backup-where]').innerText()).includes(t('setup.preferences.backupWhere')));
  await field('reminderDays').fill('7');
  await button(t('common.save')).click();
  await toast(t('settings.preferences.saved')).first().waitFor({ timeout: 15_000 });

  // ---- 8. the reminder banner and the health page --------------------------------------------------------------------------------------
  const h = history(D1('config', 'backup-history.json'));
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  writeFileSync(D1('config', 'backup-history.json'), JSON.stringify({ ...h, since: thirtyDaysAgo, lastExternalCopyAt: thirtyDaysAgo }, null, 2));   // as if the last copy was a month ago
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  const copyBanner = page.locator('[data-testid=backup-status-EXTERNAL_COPY]');
  await copyBanner.waitFor({ timeout: 15_000 });
  check('P5-12a a month without a copy elsewhere, with the reminder switched on: a second banner appears on the dashboard, in Khmer, with a link to the backup page (the local backup is still green)', (await copyBanner.innerText()).includes('30') && (await copyBanner.innerText()).includes(t('dashboard.backupCopyTitle')) && (await page.locator('[data-testid=backup-status-BACKUP_AGE]').getAttribute('data-state')) === 'OK');
  await copyBanner.locator('[data-testid=backup-banner-link]').click();
  await page.locator('[data-testid=summary-overdue]').waitFor({ timeout: 15_000 });
  check('P5-12b the link leads to the backup page, whose summary says how long it has been', (await page.locator('[data-testid=summary-overdue]').innerText()).includes('30'));
  await goTo('/settings/system', page.locator('.health-row').first());
  await button(t('health.deepCheck')).click();
  await page.locator('.health-row', { hasText: t('health.checks.BACKUP_VERIFY.title') }).waitFor({ timeout: 60_000 });
  const verifyRow = await page.locator('.health-row', { hasText: t('health.checks.BACKUP_VERIFY.title') }).innerText();
  const spaceRow = await page.locator('.health-row', { hasText: t('health.checks.BACKUP_SPACE.title') }).first().innerText();
  check('P5-12c the deep health check reads the newest backup back, and the quick one reports room for the next backup', verifyRow.includes(t('health.checks.BACKUP_VERIFY.OK')) && /\d+\s*MB/.test(spaceRow), `${verifyRow.replace(/\s+/g, ' ').slice(0, 60)} | ${spaceRow.replace(/\s+/g, ' ').slice(0, 60)}`);

  // ---- 9. the performance page: two whitelisted settings, saved to app.json, applied at the next start ----------------------------------
  await goTo('/settings/performance', page.locator('[data-testid=performance-page]'));
  await page.locator('[data-testid=preset-standard]').waitFor({ timeout: 15_000 });
  check('P5-13a the page shows the current memory use and starts on Standard with graphics on; Save is disabled until something changes',
    (await page.locator('[data-testid=performance-current]').innerText()).includes('MB') && (await page.locator('[data-testid=preset-standard]').isChecked()) && !(await page.locator('[data-testid=gpu-off]').isChecked()) && (await page.locator('[data-testid=performance-save]').isDisabled()));
  await page.locator('[data-testid=preset-low-memory]').check();
  await page.locator('[data-testid=gpu-off]').check();
  await page.locator('[data-testid=performance-save]').click();
  await modalEl().waitFor({ timeout: 15_000 });
  const cfg = JSON.parse(readFileSync(D1('config', 'app.json'), 'utf8'));
  check('P5-13b saving writes exactly those two settings into config/app.json and keeps the rest of the file, then offers a restart', cfg.performance?.preset === 'low-memory' && cfg.desktop?.disableGpu === true && cfg.backend?.port === 0 && Array.isArray(cfg.backend?.jvm?.extraArgs), JSON.stringify(cfg).slice(0, 120));
  await shot('07-performance');
  await modalEl().getByRole('button', { name: t('common.cancel'), exact: true }).click();   // "later": the test never restarts the program
  await page.locator('[data-testid=preset-standard]').check();
  await page.locator('[data-testid=gpu-off]').uncheck();
  await page.locator('[data-testid=performance-save]').click();
  await modalEl().waitFor({ timeout: 15_000 });
  await modalEl().getByRole('button', { name: t('common.cancel'), exact: true }).click();
  const cfg2 = JSON.parse(readFileSync(D1('config', 'app.json'), 'utf8'));
  check('P5-13c changing it back is saved too', cfg2.performance?.preset === 'standard' && cfg2.desktop?.disableGpu === false);

  // ---- 10. the exit prompt: closing the window with the last copy a month old offers to copy now -------------------------------------
  await goTo('/dashboard', page.locator('[data-testid=dashboard-figures]'));
  await closeWindow();
  await modalEl().locator('[data-testid=exit-backup-text]').waitFor({ timeout: 15_000 });
  check('P5-14a closing the window asks first: the last copy elsewhere is 30 days old', (await modalEl().locator('[data-testid=exit-backup-text]').innerText()).includes('30'));
  await shot('08-exit-prompt');
  await modalEl().locator('[data-testid=exit-stay]').click();
  await modalEl().waitFor({ state: 'detached', timeout: 15_000 });
  await sleep(6000);   // longer than the shell's own 5 s limit for an answer: staying must really keep the program open
  check('P5-14b "stay in the program" keeps it open (still answers after the shell\'s 5 s answer limit)', (await page.evaluate(() => document.title).catch(() => null)) !== null && alive(app.process().pid));
  const csp1 = await page.evaluate(() => window.__csp);
  const usbBefore = zipsIn(usbDir).length;
  await closeWindow();
  await modalEl().locator('[data-testid=exit-backup-text]').waitFor({ timeout: 15_000 });
  await pickPath(usbDir);
  const javaPid = Number(readFileSync(D1('config', 'backend.pid'), 'utf8'));
  const electronPid = app.process().pid;
  await modalEl().locator('[data-testid=exit-copy]').click();
  let down = false;
  for (let i = 0; i < 90 && !down; i++) { await sleep(500); down = !alive(electronPid) && !alive(javaPid); }
  check('P5-14c "copy to USB now" copies the newest good backup, proves the copy, records it, and then the program quits', down && zipsIn(usbDir).length === usbBefore + 1 && Date.now() - Date.parse(history(D1('config', 'backup-history.json')).lastExternalCopyAt) < 120_000);
  one.app = null;
  app = null;
  check('P5-15a no Content-Security-Policy violation and no console error in the first app', csp1.length === 0 && one.consoleErrors.length === 0, [...csp1, ...one.consoleErrors].slice(0, 3).join(' | '));
  check('P5-15b the log of the first app has no password and no recovery key', !readFileSync(D1('logs', 'backend.log'), 'utf8').includes(PW) && !readFileSync(D1('logs', 'desktop.log'), 'utf8').includes(PW) && !readFileSync(D1('logs', 'backend.log'), 'utf8').includes(key));

  // ---- 11. a NEW PC: restore from the very first screen, before any account exists ----------------------------------------------------
  two = await open(data2);
  ({ app, page } = two);
  await heading(t('setup.welcome.checksTitle')).waitFor({ timeout: 60_000 });
  await page.locator('[data-testid=setup-restore]').click();
  await modalEl().locator('[data-testid=restore-dialog][data-step=pick]').waitFor({ timeout: 15_000 });
  await pickPath(copy1);   // the copy that was brought on the USB stick
  await modalEl().locator('[data-testid=restore-choose]').click();
  await modalEl().locator('[data-testid=restore-dialog][data-step=review]').waitFor({ timeout: 60_000 });
  const newPcWarning = await modalEl().locator('.alert-warning').innerText();
  check('P5-16a on a new PC (no account yet) the file is checked and the dialog says the data will be put into this program, not "replace"', newPcWarning.includes(t('backup.restore.warnNewPc')) && !newPcWarning.includes(t('backup.restore.warnReplace').slice(0, 30)));
  await shot('09-new-pc-review');
  await modalEl().locator('[data-testid=restore-confirm]').click();
  await page.locator('[data-testid=restored-notice]').waitFor({ timeout: 120_000 });
  await signIn();
  await page.locator('.header-school-name').filter({ hasText: SCHOOL_A }).waitFor({ timeout: 30_000 });
  check('P5-16b the new PC now has the school (state A: the copy was made then) and the same administrator signs in', !(await page.locator('.header-school-name').innerText()).includes('(ឈ្មោះកែ)'));
  check('P5-16c nothing was backed up before replacing an EMPTY new installation (nothing to protect), and nothing is left staged', zipsIn(D2('backups', 'auto')).length === 0 && !existsSync(D2('backups', 'restore-pending')));

  // closing with nothing overdue goes straight through; a backup is made first because none exists and a day counts
  await page.evaluate(() => window.desktop.onClosing(() => console.log('E2E-CLOSING')));
  const javaPid2 = Number(readFileSync(D2('config', 'backend.pid'), 'utf8'));
  const electronPid2 = app.process().pid;
  await closeWindow();
  const modalSeen = await modalEl().locator('[data-testid=exit-backup-text]').waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
  let down2 = false;
  for (let i = 0; i < 120 && !down2; i++) { await sleep(500); down2 = !alive(electronPid2) && !alive(javaPid2); }
  check('P5-17a with no backup older than the reminder there is no question: closing just closes', !modalSeen && down2);
  check('P5-17b ...but a backup was made while it closed (none existed yet): an automatic one, verified, recorded', zipsIn(D2('backups', 'auto')).length === 1 && history(D2('config', 'backup-history.json')).entries.some((e) => e.kind === 'AUTO' && e.verifiedAt));
  check('P5-17c the shell waited for it and said so in its log', /a backup is being made before the program closes/.test(readFileSync(D2('logs', 'desktop.log'), 'utf8')));
  console.log(`      the page was told a backup is running (overlay event seen before the window went): ${two.consoleLog.includes('E2E-CLOSING')}`);
  two.app = null;
  const origins = [...new Set([...one.origins, ...two.origins])].sort();
  check('P5-18 only app://school and the local backend were contacted (no external request) in both apps', origins.every((o) => o === 'app://school' || /^http:\/\/127\.0\.0\.1:\d+$/.test(o)), origins.join(', '));
  check('P5-19 the second app had no console error either', two.consoleErrors.length === 0, two.consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  failures++;
  console.log('FAIL  harness error: ' + (e.stack ?? e.message));
  for (const [n, s] of [['one', one], ['two', two]]) { try { if (s?.page) await s.page.screenshot({ path: path.join(outDir, `backup-FAIL-${n}.png`) }); } catch { /* ignore */ } }
} finally {
  for (const s of [one, two]) { try { if (s?.app) await s.app.close(); } catch { /* ignore */ } }
  try { execFileSync('powershell.exe', ['-NoProfile', '-Command', `Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${root}\\\\node_modules\\\\*' } | Stop-Process -Force`], { stdio: 'ignore' }); } catch { /* ignore */ }
  await sleep(500);
  for (const d of [data1, data2, sameDriveDir, usbDir]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } }   // test backups are school data, even if invented: nothing is left behind
}
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
