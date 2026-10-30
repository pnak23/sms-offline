// End-to-end walkthrough of the real UI against the real backend (Edge via playwright-core).
//
//   npm run e2e -w frontend                      # Nuxt dev server + dev shim (?devBackend=...&devSecret=...)
//   npm run e2e -w frontend -- --mode static     # serves .output/public with a window.desktop stand-in (run "npm run generate -w frontend" first)
//   options: --out <dir> (screenshots, default e2e/screenshots)   --headed
//
// It walks the first-launch wizard, sign-out/in, a lock-out countdown, recovery with the key, lock/unlock (manual and
// idle), change password, key regeneration (incl. the forced page), school settings with logo, the health page,
// session expiry and loss of the backend; takes screenshots at 1366x768 and 1280x720 of every page and writes a
// summary. Exit code 1 when a step fails.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { makePng } from './lib/png.mjs';
import { FRONTEND_DIR, startBackend, startDevServer, startStaticServer, UI_ORIGIN } from './lib/servers.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const MODE = opt('mode', 'dev');
const OUT = path.resolve(opt('out', path.join(FRONTEND_DIR, 'e2e', 'screenshots', MODE)));
const HEADED = args.includes('--headed');
const MOCK_DESKTOP = MODE === 'static'; // static mode has no dev shim, so a window.desktop stand-in plays the Electron preload

const km = JSON.parse(readFileSync(path.join(FRONTEND_DIR, 'i18n', 'locales', 'km.json'), 'utf8'));
function t(key, params = {}) {
  const value = key.split('.').reduce((node, part) => node?.[part], km);
  if (typeof value !== 'string') throw new Error(`i18n key missing from km.json: ${key}`);
  return value.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

const SCHOOL_KM = 'សាលាបឋមសិក្សា ភូមិថ្មី';
const PASSWORDS = ['Sch00l-Khmer!', 'Second-Pass-2026x', 'Third-Pass-77!', 'Fourth-Pass-88!'];
const USER = 'admin';

const results = [];
const problems = []; // layout / console / network findings that are not step failures
const external = [];
const consoleErrors = [];
let backend;
let page;
let counter = 0;

const log = (...parts) => console.log(...parts);

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    log(`  PASS  ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) });
    log(`  FAIL  ${name}\n        ${String(error?.message ?? error).split('\n').join('\n        ')}`);
    try {
      await page.screenshot({ path: path.join(OUT, `FAIL-${String(++counter).padStart(2, '0')}.png`) });
    } catch {
      /* page gone */
    }
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ---- page helpers --------------------------------------------------------------------------------------------------

const field = (name) => page.locator(`input[id^="field-${name}-"], textarea[id^="field-${name}-"]`);
const button = (text) => page.getByRole('button', { name: text, exact: true });
const heading = (text) => page.locator('h1, h2, h3').filter({ hasText: text }).first();
const toast = () => page.locator('.toast-body');

async function waitText(locator, text, timeout = 10_000) {
  await locator.filter({ hasText: text }).first().waitFor({ state: 'visible', timeout });
}

async function expectToast(text) {
  await page.locator('.toast-body').filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 10_000 });
}

async function clickButton(text) {
  await button(text).click();
}

async function fieldError(name) {
  const input = field(name);
  const id = await input.getAttribute('id');
  return (await page.locator(`#${id}-error`).textContent())?.trim() ?? '';
}

async function formAlert() {
  return (await page.locator('.alert[role="alert"]').first().innerText()).trim();
}

async function readKey() {
  const groups = await page.locator('.recovery-key-block .recovery-key-group').allInnerTexts();
  return groups.join('-');
}

/** Ticks the checkbox, retypes the first group of `key`, and checks that Continue is locked until BOTH are done. */
async function passKeyGate(key, continueLabel) {
  const cont = button(continueLabel);
  assert(await cont.isDisabled(), 'Continue must be disabled before the key is confirmed');
  await page.locator('#recovery-saved').check();
  assert(await cont.isDisabled(), 'Continue must stay disabled when only the checkbox is ticked');
  await page.locator('#recovery-retype').fill('zzzzz');
  assert(await cont.isDisabled(), 'Continue must stay disabled for a wrong first group');
  await page.locator('#recovery-retype').fill(key.split('-')[0].toLowerCase());
  await page.waitForFunction((label) => [...document.querySelectorAll('.recovery-panel button')].some((b) => b.textContent.trim() === label && !b.disabled), continueLabel);
  assert(await cont.isEnabled(), 'Continue must be enabled after checkbox + first group');
}

async function layoutCheck(label) {
  const finding = await page.evaluate(() => {
    const overflow = [];
    const root = document.scrollingElement;
    if (root && root.scrollWidth > window.innerWidth + 1) overflow.push(`page scrolls horizontally (${root.scrollWidth} > ${window.innerWidth})`);
    for (const el of document.querySelectorAll('.app-content, .auth-shell, .card-body, .print-screen')) {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible') overflow.push(`${el.className} overflows by ${el.scrollWidth - el.clientWidth}px`);
    }
    return overflow;
  });
  for (const f of finding) problems.push(`[layout] ${label}: ${f}`);
}

/** Screenshots the current page at both target sizes (and checks for horizontal overflow). */
async function shoot(label) {
  counter += 1;
  for (const [width, height] of [[1366, 768], [1280, 720]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(350);
    await layoutCheck(`${label} @${width}x${height}`);
    await page.screenshot({ path: path.join(OUT, `${String(counter).padStart(2, '0')}-${label}-${width}x${height}.png`) });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
}

async function openUserMenu() {
  await page.locator('.user-menu-toggle').click();
}

const menuItem = (text) => page.locator('.dropdown-menu .dropdown-item', { hasText: text }).first();

async function signOut() {
  await openUserMenu();
  await menuItem(t('nav.signOut')).click();
  await page.waitForURL('**/login');
}

async function login(password, user = USER) {
  // wait until a previous attempt has fully finished (not busy, password field cleared by the form reset)
  await page.waitForFunction(() => {
    const submit = document.querySelector('form button[type=submit]');
    const pw = document.querySelector('input[id^="field-password-"]');
    return submit && pw && !submit.hasAttribute('aria-busy') && pw.value === '';
  });
  await field('username').fill(user);
  await field('password').fill(password);
  const answered = page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'), { timeout: 20_000 });
  await clickButton(t('auth.login.submit'));
  await answered;
}

async function goVia(href) {
  await page.locator(`a[href="${href}"]`).first().click();
  await page.waitForURL(`**${href}`);
}

async function api(method, route, token, body) {
  const response = await fetch(`${backend.base}/api/v1${route}`, {
    method,
    headers: { ...backend.headers, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// ---- the walkthrough -----------------------------------------------------------------------------------------------

async function run() {
  mkdirSync(OUT, { recursive: true });
  for (const name of (await import('node:fs')).readdirSync(OUT)) rmSync(path.join(OUT, name), { force: true });
  const dataDir = path.join(os.tmpdir(), 'sms-e2e-data');

  log(`Mode: ${MODE}   Screenshots: ${OUT}`);
  log('Starting backend ...');
  backend = await startBackend(dataDir);
  log(`  backend ${backend.base}`);
  log(`Starting UI (${MODE}) ...`);
  const ui = MODE === 'static' ? await startStaticServer() : await startDevServer();

  const browser = await chromium.launch({ channel: 'msedge', headless: !HEADED });
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'km-KH', acceptDownloads: true });
    if (MOCK_DESKTOP) {
      await context.addInitScript(({ base }) => {
        window.__calls = { printed: 0, pdf: null, diag: null, logs: 0 };
        window.desktop = {
          getInfo: async () => ({ version: 'e2e-1.0', backendBaseUrl: base }),
          onBackendStatus: () => () => undefined,
          restartBackend: async () => undefined,
          printCurrentPage: async () => {
            window.__calls.printed += 1;
            return { ok: true };
          },
          savePdfOfCurrentPage: async (o) => {
            window.__calls.pdf = o.defaultName;
            return { saved: true };
          },
          saveFile: async () => ({ saved: false }),
          printers: { list: async () => [{ name: 'Microsoft Print to PDF', isDefault: true }, { name: 'E2E Test Printer', isDefault: false }] },
          metrics: { get: async () => ({ totalWorkingSetMb: 412, processCount: 5 }) },
          health: {
            exportDiagnostics: async (report) => {
              window.__calls.diag = report;
              return { saved: true };
            },
          },
          openLogsFolder: async () => {
            window.__calls.logs += 1;
          },
          quit: async () => undefined,
        };
      }, { base: backend.base });
      // Electron's main process adds the launch secret to requests for the backend; this does the same.
      await context.route(`${backend.base}/**`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-sms-launch-secret': backend.secret } }));
    }

    page = await context.newPage();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) external.push(request.url());
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    // A full page load wipes the in-memory session; the walkthrough does it on purpose in a few steps and nowhere else.
    page.on('load', () => log(`        (page load: ${new URL(page.url()).pathname})`));

    const entry = MODE === 'static' ? `${UI_ORIGIN}/` : `${UI_ORIGIN}/?devBackend=${backend.base}&devSecret=${backend.secret}`;
    if (MODE === 'dev') {
      // Warm-up: make Vite discover every lazily imported dependency BEFORE the walkthrough starts. A re-optimisation in the
      // middle of the flow reloads the page, and a reload drops the in-memory session by design.
      await page.goto(entry);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.evaluate(async () => {
        const modules = ['layouts/default.vue', 'layouts/print.vue', 'pages/dashboard.vue', 'pages/recover.vue', 'pages/settings/system.vue', 'pages/settings/security.vue', 'pages/settings/school.vue', 'pages/settings/academic.vue', 'pages/security/recovery-key.vue'];
        await Promise.allSettled(modules.map((m) => import(/* @vite-ignore */ `/_nuxt/app/${m}`)));
      });
      await page.waitForTimeout(6000);
    }
    let firstKey = '';
    let secondKey = '';

    // ---- first launch: wizard ----
    log('\nFirst launch');
    await step('opening / sends a fresh install to the wizard (step 1) and hides the dev secret from the address bar', async () => {
      await page.goto(entry);
      await heading(t('setup.titles.1')).waitFor({ timeout: 90_000 });
      assert(page.url().endsWith('/setup'), `expected /setup, got ${page.url()}`);
      assert(!page.url().includes('devSecret'), 'devSecret must be removed from the URL');
      await page.locator('.health-row').first().waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.health-row').length >= 12);
      const fontRow = page.locator('.health-row').filter({ hasText: t('health.checks.FONTS.title') });
      assert((await fontRow.getAttribute('class')).includes('is-success'), 'bundled font check should be OK');
      await shoot('setup-1-welcome');
    });

    await step('step 1: restore button is disabled; Next is enabled when no check FAILs', async () => {
      assert(await button(t('setup.welcome.restore')).isDisabled(), 'restore must be disabled');
      assert(await button(t('common.next')).isEnabled(), 'Next must be enabled');
      await clickButton(t('common.next'));
      await heading(t('setup.titles.2')).waitFor();
    });

    await step('step 2: client and server validation of the administrator form', async () => {
      await clickButton(t('setup.admin.create'));
      assert((await fieldError('displayName')) === t('validation.REQUIRED'), 'empty display name -> REQUIRED');
      await field('displayName').fill('អ្នកគ្រប់គ្រង សាលា');
      await field('username').fill('ab');
      await field('password').fill('short');
      await field('confirmPassword').fill('different');
      await clickButton(t('setup.admin.create'));
      assert((await fieldError('username')) === t('validation.USERNAME_INVALID'), 'short username -> USERNAME_INVALID');
      assert((await fieldError('password')) === t('validation.PASSWORD_TOO_SHORT'), 'short password -> PASSWORD_TOO_SHORT');
      assert((await fieldError('confirmPassword')) === t('validation.PASSWORDS_DO_NOT_MATCH'), 'mismatch');
      await field('username').fill(USER);
      await field('password').fill('ក'.repeat(25));
      await field('confirmPassword').fill('ក'.repeat(25));
      await clickButton(t('setup.admin.create'));
      assert((await fieldError('password')) === t('validation.PASSWORD_TOO_LONG'), '25 Khmer characters (75 bytes) -> PASSWORD_TOO_LONG');
      await field('password').fill('password');
      await field('confirmPassword').fill('password');
      await clickButton(t('setup.admin.create'));
      await page.waitForFunction((msg) => [...document.querySelectorAll('.field-error')].some((e) => e.textContent.includes(msg)), t('validation.PASSWORD_WEAK'));
      await shoot('setup-2-admin-errors');
    });

    await step('step 2: creating the administrator shows the recovery key (step 3)', async () => {
      await field('password').fill(PASSWORDS[0]);
      await field('confirmPassword').fill(PASSWORDS[0]);
      await clickButton(t('setup.admin.create'));
      await heading(t('setup.titles.3')).waitFor();
      firstKey = await readKey();
      assert(/^([0-9A-HJKMNP-TV-Z]{5}-){4}[0-9A-HJKMNP-TV-Z]{5}$/.test(firstKey), `unexpected key format: ${firstKey}`);
      const stored = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage, document.cookie]));
      assert(!stored.includes(firstKey.replace(/-/g, '')) && !stored.includes(firstKey), 'recovery key must not be in browser storage');
      assert(!page.url().includes(firstKey.slice(0, 5)), 'recovery key must not be in the URL');
      await shoot('setup-3-recovery-key');
    });

    await step('step 3: print page shows the key (from memory), toolbar works, Back returns to the same panel', async () => {
      await page.getByRole('button', { name: t('recovery.printOrPdf') }).click();
      await page.waitForURL('**/print/recovery-key');
      assert(!page.url().includes(firstKey.slice(0, 5)), 'key must not be in the print URL');
      const sheetKey = (await page.locator('.key-sheet-key span').allInnerTexts()).join('-');
      assert(sheetKey === firstKey, 'print page must show the same key');
      await heading(t('print.recoveryKey.title')).waitFor();
      await shoot('print-recovery-key');
      // The sheet must print as ONE A4 page (the real printing is done by Electron; this is Chromium's own PDF of the same page).
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      writeFileSync(path.join(OUT, 'print-recovery-key.pdf'), pdf);
      const pdfText = pdf.toString('latin1');
      const pageCount = (pdfText.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
      assert(pageCount === 1, `the recovery-key sheet must be one page, got ${pageCount}`);
      const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdfText);
      assert(box && Math.abs(Number(box[1]) - 595.3) < 2 && Math.abs(Number(box[2]) - 841.9) < 2, `page size must be A4, got ${box?.[1]} x ${box?.[2]}`);
      // What the printer sees: print media on an A4-sized viewport (toolbar hidden, margins from @page).
      await page.emulateMedia({ media: 'print' });
      await page.setViewportSize({ width: 794, height: 1123 });
      await page.screenshot({ path: path.join(OUT, `${String(counter + 1).padStart(2, '0')}-print-recovery-key-PRINT-MEDIA.png`) });
      assert((await page.locator('.print-toolbar').isVisible()) === false, 'the toolbar must be hidden in print media');
      await page.emulateMedia({ media: 'screen' });
      await page.setViewportSize({ width: 1366, height: 768 });
      await clickButton(t('print.print'));
      await clickButton(t('print.savePdf'));
      if (MOCK_DESKTOP) {
        await page.waitForFunction(() => window.__calls.printed === 1 && window.__calls.pdf === 'recovery-key.pdf');
      }
      await clickButton(t('common.back'));
      await page.waitForURL('**/setup');
      await heading(t('setup.titles.3')).waitFor();
      assert((await readKey()) === firstKey, 'same key after returning from print');
    });

    await step('step 3: Continue needs the checkbox AND the first group; then the wizard moves on', async () => {
      await passKeyGate(firstKey, t('recovery.continue'));
      await clickButton(t('recovery.continue'));
      await heading(t('setup.titles.4')).waitFor();
    });

    await step('step 4: school profile (Khmer text, Khmer digits in phone, logo upload with checks)', async () => {
      await field('nameKm').fill(SCHOOL_KM);
      await field('nameEn').fill('New Village Primary School');
      await field('address').fill('ភូមិថ្មី ឃុំសាមគ្គី ស្រុកមង្គលបូរី ខេត្តបន្ទាយមានជ័យ');
      await field('phone').fill('០១២ ៣៤៥ ៦៧៨');
      assert((await field('phone').inputValue()) === '012 345 678', 'Khmer digits are converted while typing');
      await field('directorName').fill('លោក សុខ វិសាល');
      const fileInput = page.locator('input[type=file]');
      await fileInput.setInputFiles({ name: 'notes.png', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
      await page.locator('.logo-uploader .field-error').waitFor();
      assert((await page.locator('.logo-uploader .field-error').innerText()).includes(t('validation.INVALID_FILE_TYPE')), 'wrong type is rejected client-side');
      await fileInput.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 10) });
      await page.waitForFunction((msg) => document.querySelector('.logo-uploader .field-error')?.textContent.includes(msg), t('validation.FILE_TOO_LARGE'));
      await fileInput.setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is not really a png') });
      await page.waitForFunction((msg) => document.querySelector('.logo-uploader .field-error')?.textContent.includes(msg), t('validation.INVALID_IMAGE'));
      await fileInput.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: makePng(96) });
      await page.locator('.logo-preview img').waitFor();
      assert(!(await page.locator('.logo-preview img').getAttribute('src')).startsWith('http'), 'logo is shown through a blob URL');
      assert((await page.locator('.logo-preview img').getAttribute('src')).startsWith('blob:'), 'logo src must be a blob: URL');
      await shoot('setup-4-school');
      await clickButton(t('common.saveAndContinue'));
      await heading(t('setup.titles.5')).waitFor();
    });

    await step('step 5: academic year (suggested name, empty dates), grades, subject switches', async () => {
      await page.locator('.year-form').waitFor();
      assert((await field('startDate').inputValue()) === '', 'start date must start empty');
      assert((await field('endDate').inputValue()) === '', 'end date must start empty');
      await clickButton(t('academic.year.create'));
      assert((await fieldError('startDate')) === t('validation.REQUIRED'), 'dates are required');
      await page.getByRole('button', { name: /^ប្រើឈ្មោះ/ }).click();
      const suggested = await field('nameKm').inputValue();
      assert(/^[០-៩]{4}-[០-៩]{4}$/.test(suggested), `suggested name in Khmer digits, got ${suggested}`);
      await field('startDate').fill('2026-11-02');
      await field('endDate').fill('2026-10-01');
      await clickButton(t('academic.year.create'));
      assert((await fieldError('endDate')) === t('validation.END_BEFORE_START'), 'end before start');
      await field('endDate').fill('2027-08-31');
      await field('endDate').press('Enter'); // Enter submits the form (keyboard-friendly)
      await page.locator('table tbody tr').filter({ hasText: suggested }).waitFor();
      await page.locator('table .badge', { hasText: t('academic.year.current') }).waitFor();
      assert((await page.locator('.chip-list .chip').count()) === 6, 'six grades');
      const english = page.getByLabel('ភាសាអង់គ្លេស');
      assert(!(await english.isChecked()), 'English starts inactive');
      await english.check();
      await page.waitForFunction(() => document.querySelector('#subject-8')?.checked === true && !document.querySelector('#subject-8').disabled);
      await shoot('setup-5-academic');
      await clickButton(t('common.next'));
      await heading(t('setup.titles.6')).waitFor();
    });

    await step('wizard resumes where it stopped: reload at step 6, sign in again, and the wizard reopens at step 6 (not earlier than 4)', async () => {
      await heading(t('setup.titles.6')).waitFor();
      await page.reload();
      await page.waitForURL('**/login');
      await login(PASSWORDS[0]);
      await page.waitForURL('**/setup');
      await heading(t('setup.titles.6')).waitFor();
      assert(!(await page.locator('.stepper-item.is-current .stepper-dot').innerText()).includes('4'), 'must not restart at step 4');
    });

    await step('step 6: preferences accept Khmer digits, reject out-of-range, backup folder chooser is disabled', async () => {
      assert((await field('reminderDays').inputValue()) === '7', 'default reminder 7');
      assert((await field('idleLockMinutes').inputValue()) === '10', 'default idle lock 10');
      assert(await button(t('setup.preferences.chooseFolder')).isDisabled(), 'folder chooser disabled');
      await field('idleLockMinutes').fill('0');
      await clickButton(t('common.saveAndContinue'));
      assert((await fieldError('idleLockMinutes')) === t('validation.OUT_OF_RANGE'), 'idle lock 0 is out of range');
      await field('reminderDays').fill('១៥');
      assert((await field('reminderDays').inputValue()) === '15', 'Khmer digits converted');
      await field('idleLockMinutes').fill('1');
      await shoot('setup-6-preferences');
      await clickButton(t('common.saveAndContinue'));
      await heading(t('setup.titles.7')).waitFor();
    });

    await step('step 7: summary lists the real values; Start completes the wizard and opens the dashboard', async () => {
      const summary = await page.locator('.summary-list').innerText();
      assert(summary.includes(USER) && summary.includes(SCHOOL_KM) && summary.includes('15'), `summary lacks real values:\n${summary}`);
      await shoot('setup-7-finish');
      await clickButton(t('setup.finish.start'));
      await page.waitForURL('**/dashboard');
      await heading(t('dashboard.greeting', { name: 'អ្នកគ្រប់គ្រង សាលា' })).waitFor();
    });

    // ---- dashboard ----
    log('\nDashboard and persistence');
    await step('dashboard: school name and logo in the header, current year card, no setup tasks, real data only', async () => {
      await page.locator('.header-school-name').filter({ hasText: SCHOOL_KM }).waitFor();
      await page.locator('img.header-logo').waitFor();
      await page.locator('.card-header', { hasText: t('dashboard.currentYear') }).waitFor();
      await page.locator('.card-body .fs-4').waitFor();
      assert((await page.locator('.tasks-card').count()) === 0, 'no setup tasks when profile and year exist');
      await shoot('dashboard');
    });

    await step('sidebar collapses to icons and expands again', async () => {
      await page.locator('.sidebar-toggle').click();
      await page.waitForFunction(() => document.querySelector('.app-shell').classList.contains('is-collapsed'));
      await shoot('dashboard-collapsed');
      await page.locator('.sidebar-toggle').click();
      await page.waitForFunction(() => !document.querySelector('.app-shell').classList.contains('is-collapsed'));
    });

    await step('reload drops the session (token lives in memory only) and shows the sign-in page', async () => {
      await page.reload();
      await page.waitForURL('**/login');
      await heading(t('auth.login.title')).waitFor();
      const stored = await page.evaluate(() => JSON.stringify([...Object.entries(localStorage), ...Object.entries(sessionStorage)]));
      assert(!/token|Bearer|recovery/i.test(stored.replace(/sms\.dev\.connection/g, '')), `storage must hold no token/key: ${stored}`);
      await shoot('login');
    });

    await step('login: wrong password shows INVALID_CREDENTIALS, correct password opens the dashboard', async () => {
      await login('definitely-wrong');
      await waitText(page.locator('.alert[role="alert"]'), t('error.INVALID_CREDENTIALS'));
      assert((await field('password').inputValue()) === '', 'password field is cleared after a failure');
      await login(PASSWORDS[0]);
      await page.waitForURL('**/dashboard');
    });

    await step('Khmer text round-trips: the school name survives the reload exactly', async () => {
      await goVia('/settings/school');
      await field('nameKm').waitFor();
      await page.waitForFunction(() => document.querySelector('[id^="field-nameKm-"]').value.length > 0);
      assert((await field('nameKm').inputValue()) === SCHOOL_KM, `got "${await field('nameKm').inputValue()}"`);
      assert((await field('address').inputValue()).includes('ភូមិថ្មី ឃុំសាមគ្គី'), 'address round-trips');
      assert((await field('phone').inputValue()) === '012 345 678', 'phone stored with ASCII digits');
      await shoot('settings-school');
    });

    await step('school settings: stale version (OPTIMISTIC_LOCK) reloads the form with a notice', async () => {
      const { body } = await api('POST', '/auth/login', null, { username: USER, password: PASSWORDS[0] });
      const school = (await api('GET', '/settings/school', body.token)).body;
      const put = await api('PUT', '/settings/school', body.token, {
        nameKm: school.nameKm, nameEn: 'Changed elsewhere', address: school.address, phone: school.phone, directorName: school.directorName, version: school.version,
      });
      assert(put.status === 200, 'setup of the conflict failed');
      await field('address').fill('កែនៅក្នុងកម្មវិធី');
      await clickButton(t('common.save'));
      await expectToast(t('settings.school.reloaded'));
      await page.waitForFunction(() => document.querySelector('[id^="field-nameEn-"]').value === 'Changed elsewhere');
      await field('nameEn').fill('New Village Primary School');
      await clickButton(t('common.save'));
      await expectToast(t('settings.school.saved'));
      await page.waitForFunction(() => !document.querySelector('.toast.show'), null, { timeout: 15_000 }); // toasts dismiss themselves
    });

    await step('school settings: logo can be replaced and removed (confirm dialog)', async () => {
      await page.locator('input[type=file]').setInputFiles({ name: 'logo2.png', mimeType: 'image/png', buffer: makePng(128, [150, 60, 40]) });
      await expectToast(t('settings.school.logoSaved'));
      await page.getByRole('button', { name: t('common.remove'), exact: true }).first().click();
      await page.locator('.modal-content').waitFor();
      await shoot('settings-school-remove-logo');
      await page.locator('.modal-footer').getByRole('button', { name: t('common.cancel') }).click();
      await page.locator('.modal-content').waitFor({ state: 'hidden' });
      assert((await page.locator('.logo-preview img').count()) === 1, 'cancel keeps the logo');
      await page.getByRole('button', { name: t('common.remove'), exact: true }).first().click();
      await page.locator('.modal-footer').getByRole('button', { name: t('common.remove') }).click();
      await expectToast(t('settings.school.logoRemoved'));
      await page.locator('.logo-preview.is-empty').waitFor();
      await page.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: makePng(96) });
      await page.locator('.logo-preview img').waitFor();
    });

    await step('other settings pages render: academic (year list, subjects)', async () => {
      await goVia('/settings/academic');
      await page.locator('.subject-item').first().waitFor();
      await page.locator('table tbody tr').first().waitFor();
      await shoot('settings-academic');
    });

    // ---- system health ----
    log('\nSystem health');
    await step('health page: quick checks, deep check adds integrity checks, resources, diagnostics without personal data', async () => {
      await goVia('/settings/system');
      await page.waitForFunction(() => document.querySelectorAll('.health-row').length >= 12);
      const before = await page.locator('.health-row').count();
      await shoot('settings-system');
      await clickButton(t('health.deepCheck'));
      await page.waitForFunction((n) => document.querySelectorAll('.health-row').length > n, before, { timeout: 60_000 });
      await page.locator('.health-row').filter({ hasText: t('health.checks.DB_INTEGRITY.title') }).waitFor();
      if (MOCK_DESKTOP) {
        await page.locator('.printer-list li').first().waitFor();
        assert((await page.locator('.printer-list li').count()) === 2, 'two printers listed');
        await waitText(page.locator('.card-body p'), t('health.resources.appMemory', { mb: 412, count: 5 }));
        await clickButton(t('health.exportDiagnostics'));
        await page.waitForFunction(() => window.__calls.diag !== null);
        const diag = await page.evaluate(() => window.__calls.diag);
        assert(['backend', 'info', 'metrics', 'fontLoaded', 'printers'].every((k) => k in diag), 'diagnostics has the five agreed keys');
        const serialized = JSON.stringify(diag);
        assert(!serialized.includes('ភូមិថ្មី') && !serialized.includes('Village') && !serialized.includes(USER), 'diagnostics must contain no school or account data');
        assert(diag.fontLoaded === true, 'font loaded flag');
        await clickButton(t('health.openLogs'));
        await page.waitForFunction(() => window.__calls.logs === 1);
      } else {
        await clickButton(t('health.exportDiagnostics'));
      }
      await page.locator('.progress').waitFor();
      await shoot('settings-system-deep');
    });

    // ---- lock screen ----
    log('\nLock screen');
    await step('manual lock keeps the page underneath (unsaved form text survives) and unlock needs the password', async () => {
      await goVia('/settings/school');
      await field('nameKm').waitFor();
      await page.waitForFunction(() => document.querySelector('[id^="field-nameKm-"]').value.length > 0);
      await field('nameEn').fill('DRAFT not saved yet');
      await openUserMenu();
      await menuItem(t('nav.lock')).click();
      await page.locator('.lock-overlay').waitFor();
      assert(await page.locator('.app-root').evaluate((el) => el.inert), 'page underneath is inert while locked');
      await shoot('lock-screen');
      await field('password').fill('wrong-password-here');
      await clickButton(t('lock.unlock'));
      await page.waitForFunction((msg) => document.querySelector('.lock-overlay .field-error')?.textContent.includes(msg), t('validation.INVALID_PASSWORD'));
      await field('password').fill(PASSWORDS[0]);
      await clickButton(t('lock.unlock'));
      await page.locator('.lock-overlay').waitFor({ state: 'detached' });
      assert((await field('nameEn').inputValue()) === 'DRAFT not saved yet', 'draft text must survive the lock');
    });

    await step('idle lock fires after the configured minutes without input (1 minute here) - waits about a minute', async () => {
      await page.locator('.lock-overlay').waitFor({ timeout: 80_000 });
      await field('password').fill(PASSWORDS[0]);
      await page.keyboard.press('Enter');
      await page.locator('.lock-overlay').waitFor({ state: 'detached' });
      assert((await field('nameEn').inputValue()) === 'DRAFT not saved yet', 'draft survives the idle lock too');
    });

    // ---- lockout and recovery ----
    log('\nLock-out and recovery');
    await step('five wrong passwords lock sign-in: live countdown, disabled form', async () => {
      await signOut();
      for (let i = 0; i < 5; i += 1) {
        await login('wrong-attempt-' + i);
        if (i < 4) await waitText(page.locator('.alert[role="alert"]'), t('error.INVALID_CREDENTIALS'));
      }
      await page.locator('.alert-warning').waitFor();
      const first = (await page.locator('.alert-warning').innerText()).match(/\d+:\d\d/)?.[0];
      assert(first, 'countdown label shown');
      assert(await field('username').isDisabled() && await field('password').isDisabled(), 'form disabled during the lock');
      assert(await button(t('auth.login.submit')).isDisabled(), 'submit disabled during the lock');
      await page.waitForTimeout(2200);
      const second = (await page.locator('.alert-warning').innerText()).match(/\d+:\d\d/)?.[0];
      assert(second && second !== first, `countdown must tick (${first} -> ${second})`);
      await shoot('login-locked');
    });

    await step('recover: invalid key, then the real key (lower-case, no dashes) sets a new password and shows username + new key', async () => {
      await page.getByRole('link', { name: t('auth.login.forgot') }).click();
      await page.waitForURL('**/recover');
      await shoot('recover');
      await field('recoveryKey').fill('aaaaaaaaaaaaaaaaaaaaaaaaa');
      assert((await field('recoveryKey').inputValue()) === 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA', 'auto-uppercase and dashes');
      await field('newPassword').fill(PASSWORDS[1]);
      await field('confirmPassword').fill(PASSWORDS[1]);
      await clickButton(t('auth.recover.submit'));
      await waitText(page.locator('.alert[role="alert"]'), t('error.INVALID_RECOVERY_KEY'));
      await field('recoveryKey').fill(firstKey.replace(/-/g, '').toLowerCase());
      assert((await field('recoveryKey').inputValue()) === firstKey, 'tolerant paste is formatted');
      await clickButton(t('auth.recover.submit'));
      await page.locator('.username-chip').waitFor();
      assert((await page.locator('.username-chip').innerText()) === USER, 'username shown');
      secondKey = await readKey();
      assert(secondKey !== firstKey && secondKey.length === 29, 'a NEW key is issued');
      await shoot('recover-new-key');
    });

    await step('recover: print trip keeps the flow; Continue signs in with the new password and confirms the key', async () => {
      await page.getByRole('button', { name: t('recovery.printOrPdf') }).click();
      await page.waitForURL('**/print/recovery-key');
      assert((await page.locator('.key-sheet-key span').allInnerTexts()).join('-') === secondKey, 'printed key is the new key');
      await clickButton(t('common.back'));
      await page.waitForURL('**/recover');
      await page.locator('.username-chip').waitFor();
      await passKeyGate(secondKey, t('auth.recover.continue'));
      await clickButton(t('auth.recover.continue'));
      await page.waitForURL('**/dashboard');
    });

    await step('the old recovery key no longer works (checked after sign-out), the new password does', async () => {
      await signOut();
      await login(PASSWORDS[0]);
      await waitText(page.locator('.alert[role="alert"]'), t('error.INVALID_CREDENTIALS'));
      await login(PASSWORDS[1]);
      await page.waitForURL('**/dashboard');
    });

    // ---- security ----
    log('\nSecurity settings');
    await step('change password: wrong current, weak, mismatch, then success (toast)', async () => {
      await goVia('/settings/security');
      const changePw = page.locator('.page-container .col-xl-6').nth(0).locator('input[id^="field-currentPassword-"]'); // the page has two such fields
      await shoot('settings-security');
      await changePw.fill('not-my-password');
      await field('newPassword').fill(PASSWORDS[2]);
      await field('confirmPassword').fill(PASSWORDS[2]);
      await clickButton(t('security.password.submit'));
      await page.waitForFunction((msg) => [...document.querySelectorAll('.field-error')].some((e) => e.textContent.includes(msg)), t('validation.INVALID_PASSWORD'));
      await changePw.fill(PASSWORDS[1]);
      await field('newPassword').fill('password');
      await field('confirmPassword').fill('password');
      await clickButton(t('security.password.submit'));
      await page.waitForFunction((msg) => [...document.querySelectorAll('.field-error')].some((e) => e.textContent.includes(msg)), t('validation.PASSWORD_WEAK'));
      await field('newPassword').fill(PASSWORDS[2]);
      await field('confirmPassword').fill(PASSWORDS[2]);
      await clickButton(t('security.password.submit'));
      await expectToast(t('security.password.changed'));
      assert((await changePw.inputValue()) === '', 'form cleared after success');
    });

    await step('regenerate key: needs the password; panel + print + confirm; the previous key stops working', async () => {
      const panelPassword = page.locator('.card', { hasText: t('security.regenerate.title') });
      await panelPassword.locator('input[id^="field-currentPassword-"]').fill('wrong-password');
      await clickButton(t('security.regenerate.action'));
      await page.waitForFunction((msg) => [...document.querySelectorAll('.field-error')].some((e) => e.textContent.includes(msg)), t('validation.INVALID_PASSWORD'));
      await panelPassword.locator('input[id^="field-currentPassword-"]').fill(PASSWORDS[2]);
      await clickButton(t('security.regenerate.action'));
      await page.locator('.recovery-key-block').waitFor();
      const third = await readKey();
      assert(third !== secondKey, 'a new key');
      await shoot('settings-security-new-key');
      await page.getByRole('button', { name: t('recovery.printOrPdf') }).click();
      await page.waitForURL('**/print/recovery-key');
      await clickButton(t('common.back'));
      await page.waitForURL('**/settings/security');
      assert((await readKey()) === third, 'same key after the print trip');
      await passKeyGate(third, t('recovery.continue'));
      await clickButton(t('recovery.continue'));
      await expectToast(t('recovery.confirmedToast'));
      await page.locator('.recovery-key-block').waitFor({ state: 'detached' });
      secondKey = third;
    });

    await step('forced page: an unconfirmed key (app closed before saving) forces a new one after the next sign-in', async () => {
      const panelPassword = page.locator('.card', { hasText: t('security.regenerate.title') });
      await panelPassword.locator('input[id^="field-currentPassword-"]').fill(PASSWORDS[2]);
      await clickButton(t('security.regenerate.action'));
      await page.locator('.recovery-key-block').waitFor();
      // navigating away is blocked while the key is unconfirmed
      await page.locator('a[href="/dashboard"]').first().click();
      await page.waitForURL('**/security/recovery-key');
      await page.locator('.recovery-key-block').waitFor();
      await page.reload(); // "closing the app": memory (token and key) is gone
      await page.waitForURL('**/login');
      await login(PASSWORDS[2]);
      await page.waitForURL('**/security/recovery-key');
      await heading(t('security.forced.title')).waitFor();
      await shoot('forced-recovery-key');
      await field('currentPassword').fill(PASSWORDS[2]);
      await clickButton(t('security.regenerate.action'));
      await page.locator('.recovery-key-block').waitFor();
      const forcedKey = await readKey();
      await passKeyGate(forcedKey, t('recovery.continue'));
      await clickButton(t('recovery.continue'));
      await page.waitForURL('**/dashboard');
      secondKey = forcedKey;
    });

    // ---- sessions ----
    log('\nSession handling');
    await step('a revoked session (401 UNAUTHENTICATED during an action) returns to sign-in with a notice', async () => {
      await goVia('/settings/system');
      await page.waitForFunction(() => document.querySelectorAll('.health-row').length >= 12);
      const other = await api('POST', '/auth/login', null, { username: USER, password: PASSWORDS[2] });
      const changed = await api('POST', '/auth/change-password', other.body.token, { currentPassword: PASSWORDS[2], newPassword: PASSWORDS[3] });
      assert(changed.status === 204, 'second session changes the password (revokes the page session)');
      await clickButton(t('health.recheck'));
      await page.waitForURL('**/login');
      await waitText(page.locator('.alert-info'), t('auth.notice.SESSION_EXPIRED'));
      await shoot('login-session-expired');
      await login(PASSWORDS[3]);
      await page.waitForURL('**/dashboard');
    });

    await step('a revoked session is also noticed when navigating (the guard re-reads /auth/status)', async () => {
      const other = await api('POST', '/auth/login', null, { username: USER, password: PASSWORDS[3] });
      await api('POST', '/auth/change-password', other.body.token, { currentPassword: PASSWORDS[3], newPassword: PASSWORDS[2] });
      await page.locator('a[href="/settings/security"]').first().click(); // the guard answers with the sign-in page
      await page.waitForURL('**/login');
      await waitText(page.locator('.alert-info'), t('auth.notice.SESSION_EXPIRED'));
      await login(PASSWORDS[2]);
      await page.waitForURL('**/dashboard');
    });

    // ---- backend loss ----
    log('\nBackend loss');
    await step('when the backend stops, a full-page overlay with Retry appears', async () => {
      await backend.shutdown();
      // A request already in flight while the backend exits may raise the overlay first; either way it must appear.
      await page.locator('a[href="/settings/school"]').first().click({ timeout: 4000 }).catch(() => undefined);
      await page.locator('.backend-overlay').waitFor({ timeout: 20_000 });
      await heading(t('backendDown.title')).waitFor();
      const overlayRetry = page.locator('.backend-overlay').getByRole('button', { name: t('common.retry'), exact: true });
      assert(await overlayRetry.isVisible(), 'Retry button visible');
      await shoot('backend-down');
      await overlayRetry.click();
      await page.waitForTimeout(1500);
      assert(await page.locator('.backend-overlay').isVisible(), 'overlay stays while the backend is still down');
    });
  } finally {
    await browser.close().catch(() => undefined);
    await ui.stop().catch(() => undefined);
    await backend.shutdown().catch(() => undefined);
  }
}

let failed = false;
try {
  await run();
} catch (error) {
  failed = true;
  log(`\nStopped at the first failing step: ${error?.message ?? error}`);
}

const passed = results.filter((r) => r.ok).length;
log(`\nSteps: ${passed} passed, ${results.length - passed} failed`);
if (external.length) problems.push(`[network] requests to non-local hosts: ${[...new Set(external)].join(', ')}`);
for (const e of new Set(consoleErrors)) problems.push(`[console] ${e}`);
log(problems.length ? `\nFindings (${problems.length}):\n  ${problems.join('\n  ')}` : '\nNo layout, console or network findings.');
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ mode: MODE, results, problems }, null, 2));
process.exit(failed || results.some((r) => !r.ok) ? 1 : 0);
