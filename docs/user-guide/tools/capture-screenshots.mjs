// Takes the pictures of docs/user-guide/SCREENSHOTS/ from the REAL KPSMS app, on throw-away data folders. Every name, number and date in them is the program's FICTIONAL sample school
// (scripts/seed-sample-data.mjs) or text typed here for the picture; no real school or person appears.
// Usage (from the repository root; the extracted backend, the generated UI and the desktop build must be current: see docs/user-guide/README.md):
//   node docs/user-guide/tools/capture-screenshots.mjs --part wizard --data <an EMPTY folder>
//   node docs/user-guide/tools/capture-screenshots.mjs --part sample --data <a folder made with: node scripts/seed-sample-data.mjs --dir <folder>> [--only <scene id prefix>]
// It never touches the owner's .sample-data or a real data folder: it refuses a --data folder that is not a scratch folder (the wizard part needs it empty).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { launch, sleep, t } from './shots-lib.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const part = arg('--part');
const data = arg('--data') ? path.resolve(arg('--data')) : '';
const only = arg('--only') ?? '';
if (!part || !data) { console.error('Usage: node capture-screenshots.mjs --part wizard|sample --data <folder> [--only <scene prefix>]'); process.exit(2); }
if (/\.sample-data$|RuralSchoolManagement/i.test(data)) { console.error('Refusing: that looks like a real or the owner\'s sample data folder. Use a scratch folder.'); process.exit(2); }

const FICTION = {
  admin: 'អ្នកគ្រប់គ្រង សុខា', user: 'admin.sokha', password: 'Sokha-Guide-2026', school: 'សាលាបឋមសិក្សា ភូមិថ្មី', address: 'ភូមិថ្មី ឃុំគំរូ ស្រុកគំរូ ខេត្តគំរូ', phone: '012 345 678', director: 'លោកគ្រូ ចាន់ ដារា',
  yearName: '២០២៦-២០២៧', yearStart: '2026-11-01', yearEnd: '2027-08-31',
};
const wants = (id) => !only || id.startsWith(only);

if (part === 'wizard') {
  if (!existsSync(data) || readdirSync(data).length > 0) { console.error('The wizard part needs an EMPTY folder (a fresh school).'); process.exit(2); }
  const ctx = await launch(data);
  const { page, field, button } = ctx;
  try {
    // ---- step 1: the welcome page and the computer check
    await ctx.heading(t('setup.welcome.checksTitle')).waitFor({ timeout: 60_000 });
    await sleep(1500);
    if (wants('02-wizard-1')) await ctx.scene('02-wizard-1', () => ctx.shot('02-wizard-1-welcome', { marks: [button(t('common.next')), page.locator('[data-testid=setup-restore]')] }));
    await button(t('common.next')).click();

    // ---- step 2: the administrator account (and its error message)
    await field('displayName').waitFor({ timeout: 30_000 });
    await field('displayName').fill(FICTION.admin);
    await field('username').fill(FICTION.user);
    await field('password').fill('abc');
    await field('confirmPassword').click();
    await sleep(400);
    if (wants('02-wizard-2')) await ctx.scene('02-wizard-2-error', () => ctx.shot('02-wizard-2-admin-error', { marks: [field('password')] }));
    await field('password').fill(FICTION.password);
    await field('confirmPassword').fill(FICTION.password);
    await sleep(400);
    if (wants('02-wizard-2')) await ctx.scene('02-wizard-2', () => ctx.shot('02-wizard-2-admin', { marks: [field('displayName'), field('username'), field('password'), field('confirmPassword'), button(t('setup.admin.create'))] }));
    await button(t('setup.admin.create')).click();

    // ---- step 3: the recovery key (shown once)
    await page.locator('.recovery-key-block').waitFor({ timeout: 30_000 });
    await sleep(800);
    const keyGroups = await page.locator('.recovery-key-block .recovery-key-group').allInnerTexts();
    const key = keyGroups.join('-');
    if (wants('02-wizard-3')) {
      await ctx.scene('02-wizard-3', () => ctx.shot('02-wizard-3-recovery-key', { marks: [page.locator('.recovery-key-block'), button(t('recovery.printOrPdf')), page.locator('#recovery-saved'), page.locator('#recovery-retype'), button(t('recovery.continue'))] }));
      // the printable sheet of the key (the key stays in the page's memory: this is the same page the person prints)
      await ctx.scene('02-recovery-print', async () => {
        await button(t('recovery.printOrPdf')).click();
        await page.waitForURL('**/print/recovery-key', { timeout: 15_000 });
        await sleep(1500);
        try { await ctx.shot('02-recovery-key-print', { marks: [] }); }
        finally {
          await page.getByText(t('common.back'), { exact: true }).first().click();
          await page.locator('.recovery-key-block').waitFor({ timeout: 15_000 });
        }
      });
    }
    await page.locator('#recovery-saved').check();
    await page.locator('#recovery-retype').fill(key.split('-')[0].toLowerCase());
    await sleep(500);
    if (wants('02-wizard-3')) await ctx.scene('02-wizard-3b', () => ctx.shot('02-wizard-3-recovery-confirmed', { marks: [page.locator('#recovery-saved'), page.locator('#recovery-retype'), button(t('recovery.continue'))] }));
    await button(t('recovery.continue')).click();

    // ---- step 4: the school
    await field('nameKm').waitFor({ timeout: 30_000 });
    await field('nameKm').fill(FICTION.school);
    const addr = page.locator('textarea[id^="field-address-"]').first();
    if (await addr.count()) await addr.fill(FICTION.address);
    const phone = page.locator('input[id^="field-phone-"]').first();
    if (await phone.count()) await phone.fill(FICTION.phone);
    const director = page.locator('input[id^="field-director"]').first();
    if (await director.count()) await director.fill(FICTION.director);
    await sleep(400);
    if (wants('02-wizard-4')) await ctx.scene('02-wizard-4', () => ctx.shot('02-wizard-4-school', { marks: [field('nameKm'), button(t('common.saveAndContinue')), button(t('common.skipForNow'))] }));
    await button(t('common.saveAndContinue')).click();

    // ---- step 5: the academic year
    await page.locator('.year-form').waitFor({ timeout: 30_000 });
    const yearForm = page.locator('.year-form');
    await yearForm.locator('input[id^="field-nameKm-"]').fill(FICTION.yearName);
    await yearForm.locator('input[id^="field-startDate-"]').fill(FICTION.yearStart);
    await yearForm.locator('input[id^="field-endDate-"]').fill(FICTION.yearEnd);
    await sleep(400);
    if (wants('02-wizard-5')) await ctx.scene('02-wizard-5', () => ctx.shot('02-wizard-5-year', { marks: [yearForm.locator('input[id^="field-nameKm-"]'), yearForm.locator('input[id^="field-startDate-"]'), yearForm.locator('input[id^="field-endDate-"]'), yearForm.getByRole('button', { name: t('academic.year.create'), exact: true })] }));
    await yearForm.getByRole('button', { name: t('academic.year.create'), exact: true }).click();
    await page.locator('tbody tr', { hasText: FICTION.yearName }).waitFor({ timeout: 15_000 });
    await sleep(800);
    if (wants('02-wizard-5')) await ctx.scene('02-wizard-5b', () => ctx.shot('02-wizard-5-subjects', { marks: [page.locator('tbody tr', { hasText: FICTION.yearName }), button(t('common.next'))] }));
    await button(t('common.next')).click();

    // ---- step 6: the general settings
    await sleep(900);
    if (wants('02-wizard-6')) await ctx.scene('02-wizard-6', () => ctx.shot('02-wizard-6-preferences', { marks: [button(t('common.saveAndContinue'))] }));
    await button(t('common.saveAndContinue')).click();

    // ---- step 7: finished
    await button(t('setup.finish.start')).waitFor({ timeout: 30_000 });
    await sleep(1500);
    if (wants('02-wizard-7')) await ctx.scene('02-wizard-7', () => ctx.shot('02-wizard-7-finish', { marks: [button(t('setup.finish.start'))] }));
    await button(t('setup.finish.start')).click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    await sleep(2500);

    // ---- a brand-new school has no backup yet: the dashboard warns and the Backup page is empty (the fictional sample school already has one, made when its seed script closed the program)
    if (wants('15-backup')) {
      await ctx.scene('15-backup-new-school', async () => {
        await page.locator('[data-testid=backup-status-BACKUP_AGE]').waitFor({ timeout: 30_000 });
        await ctx.shot('15-dashboard-backup-warning', { clip: { x: 230, y: 70, width: 1050, height: 360 }, marks: [page.locator('[data-testid=backup-status-BACKUP_AGE]'), page.locator('[data-testid=backup-banner-now]')] });
        await ctx.go('/settings/backup');
        await page.locator('[data-testid=backup-empty]').waitFor({ timeout: 20_000 });
        await sleep(800);
        await ctx.shot('15-backup-empty', { marks: [page.locator('[data-testid=backup-status]'), page.locator('[data-testid=backup-limits]'), page.locator('[data-testid=create-backup]')] });
        await ctx.go('/dashboard');
      });
    }

    // ---- the sign-in page and the forgot-password page (after signing out)
    await page.locator('[aria-label="' + t('nav.userMenu') + '"], button:has(.bi--person-circle)').first().click().catch(() => {});
    await ctx.button(t('nav.signOut'), false).click().catch(async () => { await ctx.text(t('nav.signOut')).click(); });
    await ctx.field('username').waitFor({ timeout: 30_000 });
    await sleep(800);
    if (wants('02-login')) {
      await ctx.scene('02-login', () => ctx.shot('02-login', { clip: page.locator('main, .auth-card, form').first(), marks: [] }));
      await ctx.scene('02-login-error', async () => {
        await ctx.field('username').fill(FICTION.user);
        await ctx.field('password').fill('wrong-password');
        await ctx.button(t('auth.login.submit')).click();
        await sleep(1200);
        await ctx.shot('16-login-error', { marks: [page.locator('[role=alert], .alert-danger').first()] });
      });
      await ctx.scene('02-recover', async () => {
        await ctx.link(t('auth.login.forgot'), false).click();
        await sleep(1000);
        await ctx.shot('02-recover', { marks: [] });
      });
    }
  } finally {
    await ctx.app.close().catch(() => {});
  }
  console.log(ctx.failed.length ? `\n${ctx.failed.length} scene(s) failed:\n` + ctx.failed.map((f) => `  ${f.id}: ${f.error}`).join('\n') : '\nwizard part: every scene was taken');
  process.exit(ctx.failed.length ? 1 : 0);
}

if (part === 'sample') {
  const loginFile = path.join(data, 'SAMPLE-LOGIN.txt');
  if (!existsSync(loginFile)) { console.error('The sample part needs a folder made with: node scripts/seed-sample-data.mjs --dir <folder> (SAMPLE-LOGIN.txt is missing).'); process.exit(2); }
  const text = readFileSync(loginFile, 'utf8');
  const login = { user: /Username:\s*(\S+)/.exec(text)?.[1], pass: /Password:\s*(\S+)/.exec(text)?.[1] };
  const { runSample } = await import('./scenes-sample.mjs');
  const ctx = await launch(data);
  try {
    await runSample(ctx, wants, login);
  } finally {
    await ctx.app.close().catch(() => {});
  }
  console.log(ctx.failed.length ? `\n${ctx.failed.length} scene(s) failed:\n` + ctx.failed.map((f) => `  ${f.id}: ${f.error}`).join('\n') : '\nsample part: every scene was taken');
  process.exit(ctx.failed.length ? 1 : 0);
}
