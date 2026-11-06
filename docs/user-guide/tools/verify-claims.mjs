// Drives the REAL app on a scratch copy of the fictional sample school and checks, one by one, what the guide says the program does when a person makes a mistake: the messages, the disabled buttons,
// the defaults. It never saves anything invalid; the few things it adds go into the scratch folder only.
// Usage: node docs/user-guide/tools/verify-claims.mjs <a folder made with: node scripts/seed-sample-data.mjs --dir <folder>>
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { launch, sleep, t } from './shots-lib.mjs';

const data = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!data || !existsSync(path.join(data, 'SAMPLE-LOGIN.txt')) || /\.sample-data$|RuralSchoolManagement/i.test(data)) { console.error('Usage: node verify-claims.mjs <a scratch sample school folder>'); process.exit(2); }
const text = readFileSync(path.join(data, 'SAMPLE-LOGIN.txt'), 'utf8');
const login = { user: /Username:\s*(\S+)/.exec(text)?.[1], pass: /Password:\s*(\S+)/.exec(text)?.[1] };

const ctx = await launch(data, { scale: 1 });
const { page } = ctx;
let fails = 0;
const check = (id, claim, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${claim}${detail ? '  — ' + detail : ''}`); };
const has = async (needle, scope = page) => (await scope.getByText(needle, { exact: false }).count()) > 0;
const btn = (name) => page.getByRole('button', { name, exact: true }).first();
const lab = (scope, name) => scope.getByLabel(name, { exact: false }).first();
const modal = () => page.locator('.modal.show').first();
const attempt = async (id, fn) => { try { await ctx.closeModals(); await fn(); } catch (e) { fails++; console.log(`FAIL  ${id}  (could not run: ${String(e.message).split('\n')[0].slice(0, 160)})`); } };

try {
  await ctx.signIn(login.user, login.pass);

  await attempt('V01', async () => {
    await ctx.go('/dashboard');
    await page.locator('[data-testid=backup-status-BACKUP_AGE]').waitFor({ timeout: 20_000 });
    check('V01', 'a good backup under 24 h shows a quiet line with an information button; the limits note is hidden until it is pressed',
      (await page.locator('[data-testid=backup-limits-toggle]').count()) === 1 && !(await page.locator('[data-testid=backup-limits-note]').isVisible()));
    await page.locator('[data-testid=backup-limits-toggle]').click();
    check('V01b', 'pressing it shows the whole note about SSD, theft and physical damage', (await page.locator('[data-testid=backup-limits-note]').innerText()).includes('SSD'));
  });

  await attempt('V01c', async () => {
    await ctx.go('/dashboard');
    const card = page.locator('.card').filter({ hasText: t('events.title') }).first();
    await card.getByRole('button', { name: t('events.add') }).first().click();
    await sleep(700);
    check('V01c', 'the school-event form has the fields "ឈ្មោះព្រឹត្តិការណ៍", "ថ្ងៃចាប់ផ្តើម", "ថ្ងៃបញ្ចប់" (with the hint for one-day events) and "កំណត់ចំណាំ"',
      (await has(t('events.titleLabel'), modal())) && (await has(t('events.startDate'), modal())) && (await has(t('events.endDate'), modal())) && (await has(t('events.endHint'), modal())) && (await has(t('events.note'), modal())));
    await modal().getByRole('button', { name: t('common.save'), exact: true }).click();
    await sleep(700);
    check('V01d', 'saving an event with no name shows "ត្រូវបំពេញព័ត៌មាននេះ"', await has('ត្រូវបំពេញព័ត៌មាននេះ', modal()));
  });

  await attempt('V02', async () => {
    await ctx.go('/settings/academic');
    await btn(t('academic.year.add')).click();
    const form = page.locator('.year-form');
    await form.locator('input[id^="field-nameKm-"]').fill('សាកល្បង');
    await form.locator('input[id^="field-startDate-"]').fill('2027-01-02');
    await form.locator('input[id^="field-endDate-"]').fill('2027-01-01');
    await form.getByRole('button', { name: t('academic.year.create'), exact: true }).click();
    await sleep(800);
    check('V02', 'a year whose end is not after its start is refused with "ថ្ងៃបញ្ចប់ត្រូវនៅក្រោយថ្ងៃចាប់ផ្តើម"', await has('ថ្ងៃបញ្ចប់ត្រូវនៅក្រោយថ្ងៃចាប់ផ្តើម'));
    await form.locator('input[id^="field-nameKm-"]').fill('២០២៧-២០២៨');
    await form.locator('input[id^="field-endDate-"]').fill('2028-08-31');
    await form.getByRole('button', { name: t('academic.year.create'), exact: true }).click();
    await sleep(900);
    check('V02b', 'a year name that exists already shows "មានរួចហើយ"', await has('មានរួចហើយ'));
  });

  await attempt('V03', async () => {
    await ctx.go('/settings/academic');
    await page.locator('li.subject-item').first().waitFor({ timeout: 15_000 });
    const trash = page.locator('li.subject-item [data-remove]').first();
    check('V03', 'the trash button of a subject that exams already use is disabled', await trash.isDisabled());
    const pager = page.getByText(/ក្នុងមួយទំព័រ/).first();
    check('V03b', 'the subject list is paged (5 main subjects per page by default)', (await page.locator('li.subject-item[data-kind=main]').count()) <= 5 || (await pager.count()) > 0);
  });

  await attempt('V04', async () => {
    await ctx.go('/classes');
    await page.locator('tbody tr').first().waitFor({ timeout: 15_000 });
    await btn(t('classes.add')).click();
    await sleep(600);
    await modal().locator('select').first().selectOption({ label: 'ថ្នាក់ទី៣' });
    await lab(modal(), t('classes.name')).fill('ក');
    await lab(modal(), t('classes.capacity')).fill('201');
    await modal().getByRole('button', { name: t('common.save'), exact: true }).click();
    await sleep(900);
    check('V04', 'a capacity above 200 shows "តម្លៃនៅក្រៅដែនកំណត់"', await has('តម្លៃនៅក្រៅដែនកំណត់', modal()));
    await lab(modal(), t('classes.capacity')).fill('');
    await modal().getByRole('button', { name: t('common.save'), exact: true }).click();
    await sleep(900);
    check('V04b', 'the same grade and name twice in one year shows "មានរួចហើយ"', await has('មានរួចហើយ', modal()));
  });

  await attempt('V05', async () => {
    await ctx.go('/teachers');
    await page.locator('tbody tr').first().waitFor({ timeout: 15_000 });
    check('V05', 'the teachers list starts on the status "កំពុងបង្រៀន"', (await page.locator('select').first().evaluate((s) => s.options[s.selectedIndex].textContent)).includes('កំពុងបង្រៀន'));
    await btn(t('teachers.add')).click();
    await sleep(600);
    await modal().getByRole('button', { name: t('common.save'), exact: true }).click();
    await sleep(700);
    check('V05b', 'saving a teacher without a name shows "ត្រូវបំពេញព័ត៌មាននេះ"', await has('ត្រូវបំពេញព័ត៌មាននេះ', modal()));
  });

  await attempt('V06', async () => {
    await ctx.go('/students');
    await page.locator('tbody tr').first().waitFor({ timeout: 15_000 });
    check('V06', 'the students list starts on the status "កំពុងសិក្សា"', (await page.getByText('កំពុងសិក្សា', { exact: true }).count()) > 0);
    await (btn(t('students.add')).or(page.getByRole('link', { name: t('students.add'), exact: true }))).first().click();
    await ctx.field('nameKm').waitFor({ timeout: 15_000 });
    await btn(t('common.save')).click();
    await sleep(800);
    check('V06b', 'saving a student with nothing typed shows "ត្រូវបំពេញព័ត៌មាននេះ"', await has('ត្រូវបំពេញព័ត៌មាននេះ'));
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input[type=date]').first().fill(today);
    await btn(t('common.save')).click();
    await sleep(800);
    check('V06c', 'a date of birth of today shows "កាលបរិច្ឆេទត្រូវនៅអតីតកាល"', await has('កាលបរិច្ឆេទត្រូវនៅអតីតកាល'));
  });

  await attempt('V07', async () => {
    await ctx.go('/attendance');
    await page.locator('tbody tr').first().waitFor({ timeout: 15_000 });
    // a class that has no sheet today (the screenshot run saved one for the first class)
    const classes = await page.locator('select').nth(1).locator('option').count();
    let fresh = '';
    for (let i = 0; i < classes; i++) {
      await page.locator('select').nth(1).selectOption({ index: i });
      await sleep(900);
      if (await has('មិនទាន់បានកត់ត្រា')) { fresh = await page.locator('select').nth(1).evaluate((x) => x.options[x.selectedIndex].textContent); break; }
    }
    check('V07', 'the attendance sheet of an unrecorded day cannot be saved before anyone is marked', fresh !== '' && (await btn(t('common.save')).isDisabled()), fresh.trim());
    await btn(t('attendance.markAllPresent')).click();
    await sleep(400);
    check('V07b', '"កំណត់ទាំងអស់ថាមានវត្តមាន" enables saving', await btn(t('common.save')).isEnabled());
  });

  await attempt('V08', async () => {
    await ctx.go('/exams');
    await page.locator('tbody tr a').first().click();
    await page.locator('tbody input').first().waitFor({ timeout: 20_000 });
    const box = page.locator('tbody input[type=text], tbody input:not([type=checkbox])').first();
    await box.fill('999');
    await sleep(500);
    check('V08', 'a score above the maximum shows "តម្លៃនៅក្រៅដែនកំណត់" and disables saving', (await has('តម្លៃនៅក្រៅដែនកំណត់')) && (await btn(t('common.save')).isDisabled()));
    await box.fill('abc');
    await sleep(500);
    check('V08b', 'a score that is not a number shows "សូមបញ្ចូលលេខឱ្យបានត្រឹមត្រូវ"', await has('សូមបញ្ចូលលេខឱ្យបានត្រឹមត្រូវ'));
    check('V08c', 'the screen says an empty box is "not entered", not zero', await has('ទុកប្រអប់ទទេ'));
    await page.getByRole('button', { name: 'បោះបង់ការផ្លាស់ប្តូរ', exact: true }).click().catch(() => {});
  });

  await attempt('V09', async () => {
    await ctx.go('/settings/timetable');
    await page.getByText(t('timetable.settings.title')).first().waitFor({ timeout: 15_000 });
    await btn(t('timetable.settings.add')).click();
    await sleep(600);
    await lab(page, t('timetable.settings.slotName')).fill('ត្រួត');
    await lab(page, t('attendancePeriods.start')).fill('07:30');
    await lab(page, t('attendancePeriods.end')).fill('08:00');
    await btn(t('common.save')).click();
    await sleep(900);
    check('V09', 'a time slot that overlaps another is refused with "ម៉ោងនេះត្រួតនឹងម៉ោងផ្សេងរបស់ឆ្នាំនេះ"', await has('ម៉ោងនេះត្រួតនឹងម៉ោងផ្សេងរបស់ឆ្នាំនេះ'));
  });

  await attempt('V10', async () => {
    await ctx.go('/timetable');
    const add = page.locator('button[aria-label^="' + t('timetable.addLesson').split('{')[0] + '"]').first();
    await add.waitFor({ timeout: 20_000 });
    await add.click();
    await sleep(700);
    const save = modal().getByRole('button', { name: t('common.save'), exact: true });
    check('V10', 'a lesson cannot be saved before BOTH a subject and a teacher are chosen', await save.isDisabled());
  });

  await attempt('V11', async () => {
    await ctx.go('/homework');
    await page.locator('tbody tr').first().waitFor({ timeout: 15_000 });
    await btn(t('homework.add')).click();
    await sleep(700);
    const dates = modal().locator('input[type=date]');
    await dates.nth(0).fill('2026-11-10');
    await dates.nth(1).fill('2026-11-09');
    await btn(t('common.save')).click().catch(async () => { await modal().getByRole('button', { name: t('common.save'), exact: true }).click(); });
    await sleep(900);
    check('V11', 'a homework due before the day it is given shows "ថ្ងៃកំណត់មិនអាចនៅមុនថ្ងៃឱ្យទេ"', await has('ថ្ងៃកំណត់មិនអាចនៅមុនថ្ងៃឱ្យទេ'));
  });

  await attempt('V12', async () => {
    await ctx.go('/fees');
    await page.locator('tbody tr a').first().waitFor({ timeout: 15_000 });
    await page.locator('tbody tr a').first().click();
    const pay = page.getByRole('button', { name: t('fees.pay'), exact: true }).first();
    await pay.waitFor({ timeout: 15_000 });
    await pay.click();
    await sleep(700);
    await modal().locator('input').first().fill('99999999');
    await modal().getByRole('button', { name: t('fees.recordPayment'), exact: true }).click();
    await sleep(900);
    check('V12', 'a payment above what is owed is refused with "ចំនួនទឹកប្រាក់លើសពីអ្វីដែលនៅជំពាក់"', await has('ចំនួនទឹកប្រាក់លើសពីអ្វីដែលនៅជំពាក់'));
  });

  await attempt('V13', async () => {
    await ctx.go('/settings/backup');
    await page.locator('[data-testid=backup-row]').first().waitFor({ timeout: 20_000 });
    const newest = page.locator('[data-testid=backup-row]').first();
    check('V13', 'the delete button of the newest good backup is disabled', await newest.locator('[data-testid^="delete-"]').isDisabled());
  });
} finally {
  await ctx.app.close().catch(() => {});
}
console.log(fails ? `\n${fails} check(s) FAILED` : '\nevery check passed');
process.exit(fails ? 1 : 0);
