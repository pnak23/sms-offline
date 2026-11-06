// The scenes of docs/user-guide/tools/capture-screenshots.mjs --part sample: one scene per picture (or two), on a scratch copy of the program's FICTIONAL sample school. Every label used here is
// copied from the screen text in frontend/i18n/locales/km.json (scripts/check-guide.mjs checks the guide's quoted labels against it again). A scene that fails is reported and skipped.
import { sleep, t } from './shots-lib.mjs';

export async function runSample(ctx, wants, login) {
  const { page } = ctx;
  const btn = (text) => page.getByRole('button', { name: text, exact: true }).first();
  const link = (text) => page.getByRole('link', { name: text, exact: true }).first();
  const inModal = () => page.locator('.modal.show').first();
  const lab = (scope, text) => scope.getByLabel(text, { exact: false }).first();
  const dash = () => page.locator('[data-testid=dashboard-figures]');
  const scroll = (locator) => locator.first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const currentYearOption = async () => page.locator('select').first().locator('option').evaluateAll((os) => os.find((o) => /បច្ចុប្បន្ន/.test(o.textContent))?.textContent ?? os[0]?.textContent);
  const S = (id, fn) => (wants(id) ? ctx.scene(id, fn) : Promise.resolve());

  await ctx.signIn(login.user, login.pass);

  // ================= chapter 1: the program, the menu, the top bar, the dashboard
  await S('01-dashboard', async () => {
    await ctx.go('/dashboard');
    await dash().waitFor({ timeout: 30_000 });
    await sleep(3000);
    await ctx.shot('01-dashboard-overview', { marks: [page.locator('aside.app-sidebar'), page.locator('[data-testid=hero-actions]'), page.locator('[data-testid=backup-status-BACKUP_AGE]'), dash()] });
    await scroll(page.locator('.dash-charts'));
    await sleep(1500);
    await ctx.shot('01-dashboard-charts', { marks: [] });
    await page.locator('.dashboard').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  });
  await S('01-usermenu', async () => {
    await ctx.go('/dashboard');
    await page.getByRole('button', { name: t('nav.userMenu') }).first().click();
    await sleep(600);
    const menu = page.locator('.dropdown-menu.show').first();
    await ctx.shot('01-user-menu', { marks: [page.getByText(t('nav.lock'), { exact: true }).first(), page.getByText(t('nav.changePassword'), { exact: true }).first(), page.getByText(t('nav.signOut'), { exact: true }).first()], clip: { x: 760, y: 0, width: 520, height: 330 } });
    await page.getByText(t('nav.lock'), { exact: true }).first().click();
    await sleep(900);
    await ctx.shot('01-lock-screen', { marks: [page.getByRole('button', { name: t('lock.unlock') }).first()] });
    await page.locator('input[type=password]').first().fill(login.pass);
    await page.getByRole('button', { name: t('lock.unlock') }).first().click();
    await sleep(900);
    void menu;
  });

  await S('01-events', async () => {
    await ctx.go('/dashboard');
    await dash().waitFor({ timeout: 30_000 });
    await sleep(2500);
    const card = page.locator('.card').filter({ hasText: t('events.title') }).first();
    await card.scrollIntoViewIfNeeded();
    await ctx.shot('01-dashboard-events', { marks: [card.getByRole('button', { name: t('events.add') }).first()] });
    await card.getByRole('button', { name: t('events.add') }).first().click();
    await sleep(700);
    await lab(inModal(), t('events.titleLabel')).fill('កីឡាសាលា (ឧទាហរណ៍)');
    await ctx.shot('01-event-form', { marks: [lab(inModal(), t('events.titleLabel')), lab(inModal(), t('events.startDate')), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
  });

  // ================= chapter 3: the school's information
  await S('03-school', async () => {
    await ctx.go('/settings/school');
    await ctx.field('nameKm').waitFor({ timeout: 20_000 });
    await ctx.shot('03-school-settings', { marks: [ctx.field('nameKm'), page.locator('textarea[id^="field-address-"]'), page.getByText(t('settings.school.logo'), { exact: false }), btn(t('common.save'))] });
  });

  // ================= chapter 4: academic years (a second year is created: promotion in chapter 7 needs it)
  await S('04-years', async () => {
    await ctx.go('/settings/academic');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await ctx.shot('04-years-list', { marks: [btn(t('academic.year.add')), page.locator('tbody tr').first()] });
    await btn(t('academic.year.add')).click();
    const form = page.locator('.year-form');
    await form.locator('input[id^="field-nameKm-"]').fill('២០២៧-២០២៨');
    await form.locator('input[id^="field-startDate-"]').fill('2027-11-01');
    await form.locator('input[id^="field-endDate-"]').fill('2028-08-31');
    await sleep(500);
    await ctx.shot('04-year-form', { marks: [form.locator('input[id^="field-nameKm-"]'), form.locator('input[id^="field-startDate-"]'), form.locator('input[id^="field-endDate-"]'), form.getByRole('button', { name: t('academic.year.create'), exact: true })] });
    await form.getByRole('button', { name: t('academic.year.create'), exact: true }).click();
    await page.locator('tbody tr', { hasText: '២០២៧-២០២៨' }).waitFor({ timeout: 15_000 });
    await sleep(800);
  });
  await S('04-year-close', async () => {
    await ctx.go('/settings/academic');
    const row = page.locator('tbody tr').filter({ hasText: t('academic.year.current') }).first();
    await row.getByRole('button', { name: t('academic.year.close'), exact: true }).click();
    await sleep(800);
    await ctx.shot('04-year-close-confirm', { marks: [inModal().getByRole('button', { name: t('academic.year.close'), exact: true }), inModal().getByRole('button', { name: t('common.cancel'), exact: true })] });
  });

  // ================= chapter 5: subjects, classes
  await S('05-subjects', async () => {
    await ctx.go('/settings/academic');
    await page.locator('li.subject-item').first().waitFor({ timeout: 20_000 });
    await ctx.shot('05-subjects-list', { marks: [btn(t('academic.subjects.add')), page.locator('li.subject-item').first(), page.locator('li.subject-item [data-add-sub]').first()] });
    await btn(t('academic.subjects.add')).click();
    await sleep(700);
    await lab(inModal(), t('academic.subjects.nameKm')).fill('កុំព្យូទ័រ');
    await ctx.shot('05-subject-form', { marks: [lab(inModal(), t('academic.subjects.nameKm')), inModal().locator('select').first(), inModal().getByRole('button', { name: t('academic.subjects.create'), exact: true })] });
  });
  await S('05-grade-table', async () => {
    await ctx.go('/settings/academic');
    await page.locator('table').nth(1).waitFor({ timeout: 20_000 });
    await ctx.shot('05-grade-table', { marks: [page.locator('table').nth(1)] });
  });
  await S('05-classes', async () => {
    await ctx.go('/classes');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await ctx.shot('05-classes-list', { marks: [page.locator('select').first(), btn(t('classes.add')), page.locator('tbody tr').first()] });
  });
  await S('05-class-new-year', async () => {
    // a Grade 4 class in the new year, so that the promotion in chapter 7 has somewhere to go
    await ctx.go('/classes');
    await page.locator('select').first().selectOption({ label: '២០២៧-២០២៨' });
    await sleep(700);
    await btn(t('classes.add')).click();
    await sleep(700);
    await inModal().locator('select').first().selectOption({ label: 'ថ្នាក់ទី៤' });
    await lab(inModal(), t('classes.name')).fill('ក');
    await sleep(400);
    await ctx.shot('05-class-form', { marks: [inModal().locator('select').first(), lab(inModal(), t('classes.name')), lab(inModal(), t('classes.capacity')), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
    await inModal().getByRole('button', { name: t('common.save'), exact: true }).click();
    await sleep(1500);
    await page.locator('select').first().selectOption({ label: await currentYearOption() });
    await sleep(700);
  });
  await S('05-class-detail', async () => {
    await ctx.go('/classes');
    await page.locator('tbody tr a').first().click();
    await page.getByText(t('classes.teachersTitle')).first().waitFor({ timeout: 20_000 });
    await sleep(800);
    await ctx.shot('05-class-detail', { marks: [btn(t('classes.enrollTitle')), btn(t('common.edit')), page.getByText(t('classes.teachersTitle')).first()] });
  });

  // ================= chapter 6: teachers
  await S('06-teachers', async () => {
    await ctx.go('/teachers');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await ctx.shot('06-teachers-list', { marks: [page.locator('input[type=search], input[placeholder]').first(), page.locator('select').first(), btn(t('teachers.add')), page.locator('tbody tr a').first()] });
    await btn(t('teachers.add')).click();
    await sleep(700);
    await lab(inModal(), t('teachers.nameKm')).fill('វ៉ន សុវណ្ណ');
    await lab(inModal(), t('common.phone')).fill('012 111 222');
    await lab(inModal(), t('teachers.specialization')).fill('គណិតវិទ្យា');
    await sleep(400);
    await ctx.shot('06-teacher-form', { marks: [lab(inModal(), t('teachers.nameKm')), lab(inModal(), t('common.phone')), lab(inModal(), t('teachers.specialization')), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
  });
  await S('06-teacher-profile', async () => {
    await ctx.go('/teachers');
    await page.locator('tbody tr a').first().click();
    await page.getByText(t('teachers.classesTitle')).first().waitFor({ timeout: 20_000 });
    await sleep(800);
    await ctx.shot('06-teacher-profile', { marks: [btn(t('common.edit')), btn(t('teachers.deactivate')), page.getByText(t('teachers.classesTitle')).first()] });
  });

  // ================= chapter 7: students
  await S('07-students', async () => {
    await ctx.go('/students');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await ctx.shot('07-students-list', { marks: [page.locator('input[type=search], input[placeholder]').first(), page.locator('select').first(), btn(t('students.exportExcel')), btn(t('promotion.title')).or(link(t('promotion.title'))), btn(t('students.add')).or(link(t('students.add'))), page.locator('tbody tr a').first()] });
  });
  await S('07-student-new', async () => {
    await ctx.go('/students');
    await (btn(t('students.add')).or(link(t('students.add')))).first().click();
    await ctx.field('nameKm').waitFor({ timeout: 20_000 });
    await ctx.field('nameKm').fill('ឈួន ចាន់ថា');
    await page.locator('input[type=date]').first().fill('2018-04-12');
    await ctx.shot('07-student-new', { marks: [ctx.field('nameKm'), page.locator('input[type=date]').first()] });
    await btn(t('students.addGuardian')).click();
    await sleep(500);
    await ctx.shot('07-student-new-guardian', { marks: [btn(t('students.addGuardian')), btn(t('common.save'))] });
  });
  await S('07-student-profile', async () => {
    await ctx.go('/students');
    await page.locator('tbody tr').filter({ hasText: 'ថ្នាក់ទី' }).first().locator('a').first().click();
    await page.getByText(t('students.historyTitle')).first().waitFor({ timeout: 20_000 });
    await sleep(800);
    await ctx.shot('07-student-profile', { marks: [page.getByText(t('students.printProfile'), { exact: true }).first(), btn(t('common.edit')), btn(t('students.move.transferTitle')), page.getByText(t('students.historyTitle')).first()] });
    await btn(t('students.move.transferTitle')).click();
    await sleep(800);
    await ctx.shot('07-student-transfer', { marks: [inModal().locator('select').first(), inModal().getByRole('button', { name: t('students.move.transferTitle'), exact: true })] });
  });
  await S('07-promotion', async () => {
    await ctx.go('/students');
    await (btn(t('promotion.title')).or(link(t('promotion.title')))).first().click();
    await page.locator('select').nth(2).waitFor({ timeout: 20_000 });
    const classSelect = page.locator('select').nth(2);
    await sleep(1500);
    const at = await classSelect.locator('option').evaluateAll((os) => os.findIndex((o) => /ថ្នាក់ទី៣/.test(o.textContent)));
    await classSelect.selectOption({ index: at });
    await sleep(1200);
    await ctx.shot('07-promotion', { marks: [page.locator('select').nth(0), page.locator('select').nth(1), classSelect] });
    await btn(t('promotion.preview')).click();
    await sleep(1500);
    await ctx.shot('07-promotion-preview', { marks: [btn(t('promotion.apply'))] });
  });

  // ================= chapter 8: attendance
  await S('08-sessions', async () => {
    await ctx.go('/settings/attendance-sessions');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await ctx.shot('08-sessions', { marks: [btn(t('attendancePeriods.add')), page.locator('tbody tr').first()] });
    await btn(t('attendancePeriods.add')).click();
    await sleep(700);
    const nameBox = lab(page, t('attendancePeriods.name')), startBox = lab(page, t('attendancePeriods.start')), endBox = lab(page, t('attendancePeriods.end'));
    await nameBox.fill('ថ្នាក់បន្ថែម');
    await startBox.fill('15:00');
    await endBox.fill('16:00');
    await sleep(400);
    await ctx.shot('08-session-form', { marks: [nameBox, startBox, endBox, btn(t('common.save'))] });
  });
  await S('08-attendance', async () => {
    await ctx.go('/attendance');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await btn(t('attendance.markAllPresent')).click();
    await sleep(400);
    await page.locator('tbody tr').nth(1).getByText(t('attendance.status.ABSENT'), { exact: true }).click();
    await page.locator('tbody tr').nth(2).getByText(t('attendance.status.LATE'), { exact: true }).click();
    await sleep(500);
    await ctx.shot('08-attendance-entry', { marks: [page.locator('select').nth(1), page.locator('input[type=date]').first(), btn(t('attendance.markAllPresent')), page.locator('tbody tr').nth(1)] });
    await ctx.shot('08-attendance-save', { marks: [btn(t('common.save'))] });
    await btn(t('common.save')).click();
    await sleep(900);
    await ctx.shot('08-attendance-saved', { toast: true, marks: [] });
  });
  await S('08-history', async () => {
    await ctx.go('/attendance');
    await page.getByRole('tab', { name: t('attendance.tabHistory') }).or(page.getByRole('button', { name: t('attendance.tabHistory') })).first().click();
    await sleep(1500);
    await ctx.shot('08-attendance-history', { marks: [page.getByText(t('attendance.tabHistory')).first()] });
  });

  // ================= chapter 9: the weekly timetable (the slots typed here are EXAMPLES for the picture; the program ships none)
  await S('09-slots', async () => {
    await ctx.go('/settings/timetable');
    await page.getByText(t('timetable.settings.title')).first().waitFor({ timeout: 20_000 });
    await ctx.shot('09-slots-empty', { marks: [btn(t('timetable.settings.add')), page.getByText(t('timetable.unconfiguredTitle')).first()] });
    const add = async (name, from, to, isBreak = false) => {
      await btn(t('timetable.settings.add')).click();
      await sleep(600);
      await lab(page, t('timetable.settings.slotName')).fill(name);
      await lab(page, t('attendancePeriods.start')).fill(from);
      await lab(page, t('attendancePeriods.end')).fill(to);
      if (isBreak) await page.getByLabel(t('timetable.settings.isBreak'), { exact: false }).first().check();
      if (name === 'ម៉ោងទី១') { await sleep(400); await ctx.shot('09-slot-form', { marks: [lab(page, t('timetable.settings.slotName')), lab(page, t('attendancePeriods.start')), lab(page, t('attendancePeriods.end')), btn(t('common.save'))] }); }
      await btn(t('common.save')).click();
      await sleep(900);
    };
    await add('ម៉ោងទី១', '07:00', '07:45');
    await add('ម៉ោងទី២', '07:45', '08:30');
    await add('ម៉ោងសម្រាក', '08:30', '08:45', true);
    await add('ម៉ោងទី៣', '08:45', '09:30');
    await ctx.shot('09-slots-list', { marks: [page.locator('tbody tr').first()] });
  });
  await S('09-timetable', async () => {
    await ctx.go('/timetable');
    await page.locator('button[aria-label^="' + t('timetable.addLesson').split('{')[0] + '"]').first().waitFor({ timeout: 20_000 });
    await ctx.shot('09-timetable-empty', { marks: [page.locator('select').nth(1), btn(t('timetable.copy.fromClass')), page.locator('button[aria-label^="' + t('timetable.addLesson').split('{')[0] + '"]').first()] });
    await page.locator('button[aria-label^="' + t('timetable.addLesson').split('{')[0] + '"]').first().click();
    await sleep(800);
    await lab(inModal(), t('timetable.cell.subject')).selectOption({ index: 1 });
    await sleep(500);
    await ctx.shot('09-timetable-cell', { marks: [lab(inModal(), t('timetable.cell.subject')), lab(inModal(), t('timetable.cell.teacher')), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
    await inModal().getByRole('button', { name: t('common.save'), exact: true }).click();
    await sleep(1200);
    // a second and third lesson, so that the week looks like a week
    for (const n of [0, 1]) {
      const cell = page.locator('button[aria-label^="' + t('timetable.addLesson').split('{')[0] + '"]').nth(n * 3);
      await cell.click(); await sleep(700);
      await lab(inModal(), t('timetable.cell.subject')).selectOption({ index: 2 + n });
      await sleep(400);
      await inModal().getByRole('button', { name: t('common.save'), exact: true }).click(); await sleep(1100);
    }
    await ctx.shot('09-timetable-week', { marks: [page.locator('select').nth(1), btn(t('print.print')).or(link(t('print.print'))), page.locator('button[aria-label^="' + t('timetable.changeLesson').split('{')[0] + '"]').first()] });
  });

  // ================= chapter 10: examinations and scores
  await S('10-exams', async () => {
    await ctx.go('/exams');
    await page.locator('tbody tr a').first().waitFor({ timeout: 20_000 });
    await ctx.shot('10-exams-list', { marks: [btn(t('exams.add')), page.locator('tbody tr a').first()] });
    await btn(t('exams.add')).click();
    await sleep(700);
    await lab(inModal(), t('exams.name')).fill('ប្រឡងប្រចាំខែធ្នូ');
    await sleep(400);
    await ctx.shot('10-exam-form', { marks: [lab(inModal(), t('exams.name')), inModal().locator('select').first(), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
  });
  await S('10-exam-tabs', async () => {
    await ctx.go('/exams');
    await page.locator('tbody tr a').first().click();
    await page.getByRole('tab', { name: t('exams.tabScores') }).or(page.getByRole('button', { name: t('exams.tabScores') })).first().waitFor({ timeout: 20_000 });
    await sleep(1500);
    await ctx.shot('10-exam-scores', { marks: [page.getByText(t('exams.tabScores')).first(), page.locator('select').nth(0), page.locator('select').nth(1)] });
    await ctx.shot('10-exam-scores-entry', { marks: [page.locator('tbody input:visible').first()] });
    const tab = (text) => page.locator('.nav-link, .nav-tabs button, [role=tab]').filter({ hasText: text }).first();
    await tab(t('exams.tabResults')).click();
    await sleep(1500);
    await ctx.shot('10-exam-results', { marks: [tab(t('exams.tabResults')), page.locator('table:visible thead').first()] });
    await tab(t('exams.tabSubjects')).click();
    await sleep(1500);
    await ctx.shot('10-exam-subjects', { marks: [tab(t('exams.tabSubjects')), page.locator('table:visible thead').first()] });
  });
  await S('10-grading', async () => {
    await ctx.go('/settings/grading');
    await page.locator('table').first().waitFor({ timeout: 20_000 });
    await ctx.shot('10-grading', { marks: [btn(t('grading.add')), page.locator('table').first()] });
  });

  // ================= chapter 11: report cards, roll of honour, monthly ranking
  await S('11-report-cards', async () => {
    await ctx.go('/report-cards');
    await page.locator('tbody tr').first().waitFor({ timeout: 25_000 });
    await sleep(1200);
    await ctx.shot('11-report-cards', { marks: [page.locator('select').nth(2), btn(t('reportCards.printAll')).or(link(t('reportCards.printAll'))), page.locator('tbody tr').first().getByRole('button', { name: t('reportCards.writeComment') }), page.locator('tbody tr').first().getByRole('link', { name: t('print.print') })] });
    await page.locator('tbody tr').first().getByRole('button', { name: t('reportCards.writeComment') }).click();
    await sleep(700);
    await ctx.shot('11-report-card-comment', { marks: [inModal().locator('textarea'), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
  });
  await S('11-report-card-print', async () => {
    await ctx.go('/report-cards');
    await page.locator('tbody tr').first().waitFor({ timeout: 25_000 });
    await page.locator('tbody tr').first().getByRole('link', { name: t('print.print') }).click();
    await page.waitForURL('**/print/report-cards**', { timeout: 20_000 });
    await sleep(3500);
    await ctx.shot('11-report-card-print', { marks: [] });
    await page.getByText(t('common.back'), { exact: true }).first().click();
    await sleep(1200);
  });
  await S('11-card-settings', async () => {
    await ctx.go('/settings/report-card');
    await sleep(2000);
    await ctx.shot('11-card-template', { marks: [page.locator('input[type=checkbox]').first()] });
    await ctx.go('/settings/reports');
    await sleep(1500);
    await ctx.shot('11-print-settings', { marks: [page.locator('input[type=checkbox]').first()] });
  });
  await S('11-honor-ranking', async () => {
    await ctx.go('/honor-roll');
    await sleep(2500);
    await ctx.shot('11-honor-roll', { marks: [page.locator('select').nth(2)] });
    await ctx.go('/monthly-ranking');
    await sleep(2500);
    await ctx.shot('11-monthly-ranking', { marks: [page.locator('select').nth(2)] });
  });

  // ================= chapter 12: homework
  await S('12-homework', async () => {
    await ctx.go('/homework');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await ctx.shot('12-homework-list', { marks: [btn(t('homework.add')), page.locator('tbody tr').first(), page.locator('tbody tr').first().getByRole('button', { name: t('homework.students') })] });
    await btn(t('homework.add')).click();
    await sleep(800);
    await ctx.shot('12-homework-form', { marks: [inModal().locator('select').first(), ctx.field('title'), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
  });
  await S('12-homework-sheet', async () => {
    await ctx.go('/homework');
    await page.locator('tbody tr').first().getByRole('button', { name: t('homework.students') }).click();
    await sleep(1500);
    await ctx.shot('12-homework-sheet', { marks: [inModal().locator('tbody select').first(), inModal().getByRole('button', { name: t('common.save'), exact: true })] });
  });

  // ================= chapter 13: fees (the sample school has them switched on)
  await S('13-fees-settings', async () => {
    await ctx.go('/settings/fees');
    await sleep(1500);
    await ctx.shot('13-fees-settings', { marks: [page.locator('input[type=checkbox]').first(), page.locator('select').first(), btn(t('fees.addCategory'))] });
  });
  await S('13-fees', async () => {
    await ctx.go('/fees');
    await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
    await ctx.shot('13-fees-class', { marks: [page.locator('select').nth(1), btn(t('fees.chargeClass')), page.locator('tbody tr').first()] });
    await page.locator('tbody tr a').first().click();
    await sleep(1800);
    await ctx.shot('13-fees-student', { marks: [btn(t('fees.addCharge'))] });
    const pay = page.getByRole('button', { name: t('fees.pay'), exact: true }).first();
    if (await pay.count()) {
      await pay.click(); await sleep(800);
      await ctx.shot('13-fees-payment', { marks: [inModal().locator('input').first(), inModal().getByRole('button', { name: t('fees.recordPayment'), exact: true })] });
      await ctx.closeModals();
    }
    const receipt = page.getByRole('link', { name: t('fees.receipt'), exact: true }).first();
    if (await receipt.count()) {
      await receipt.click();
      await page.waitForURL('**/print/receipt/**', { timeout: 15_000 });
      await sleep(2500);
      await ctx.shot('13-fees-receipt', { marks: [] });
      await page.getByText(t('common.back'), { exact: true }).first().click();
    }
  });

  // ================= chapter 14: reports
  await S('14-reports', async () => {
    await ctx.go('/reports');
    await page.getByText(t('reports.title')).first().waitFor({ timeout: 20_000 });
    await sleep(1000);
    await ctx.shot('14-reports', { marks: [page.getByText(t('reports.preview'), { exact: true }).first(), page.getByText(t('reports.excel'), { exact: true }).first()] });
    await page.getByText(t('reports.preview'), { exact: true }).first().click();
    await page.waitForURL('**/print/report**', { timeout: 20_000 });
    await sleep(3000);
    await ctx.shot('14-report-print', { marks: [] });
    await page.getByText(t('common.back'), { exact: true }).first().click();
  });

  // ================= chapter 15: backup and restore
  await S('15-backup', async () => {
    await ctx.go('/settings/backup');
    await page.locator('[data-testid=backup-page]').waitFor({ timeout: 20_000 });
    await sleep(1200);
    await page.locator('[data-testid=create-backup]').click();
    // the sample school already holds the backup made when its seed script closed the program: wait for the NEW one
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=backup-row]').length >= 2, null, { timeout: 90_000 });
    await sleep(1500);
    await ctx.shot('15-backup-list', { marks: [page.locator('[data-testid=backup-status]'), page.locator('[data-testid=create-backup]'), page.locator('[data-testid=restore-from-file]'), page.locator('[data-testid=backup-row]').first()] });
    await page.locator('[data-testid=backup-row]').first().getByRole('button', { name: t('backup.action.restore'), exact: true }).click();
    await page.locator('.modal.show').first().waitFor({ timeout: 60_000 });
    await sleep(2500);
    await ctx.shot('15-restore-dialog', { marks: [inModal().getByRole('button', { name: t('backup.restore.confirm'), exact: true }), inModal().getByRole('button', { name: t('common.cancel'), exact: true })] });
  });
  await S('15-dashboard-quiet', async () => {
    await ctx.go('/dashboard');
    await page.locator('[data-testid=backup-status-BACKUP_AGE]').waitFor({ timeout: 30_000 });
    await sleep(1500);
    await page.locator('[data-testid=backup-limits-toggle]').click();
    await sleep(500);
    await ctx.shot('15-dashboard-backup-line', { clip: { x: 230, y: 70, width: 1050, height: 330 }, marks: [page.locator('[data-testid=backup-limits-toggle]'), page.locator('[data-testid=backup-limits-note]'), page.locator('[data-testid=backup-banner-link]')] });
  });

  // ================= chapter 17: security and care of the data
  await S('17-pages', async () => {
    for (const [href, id, markSel] of [['/settings/security', '17-security', 'input[type=password]'], ['/settings/preferences', '17-preferences', 'input'], ['/settings/system', '17-system-health', 'h1, h2'], ['/settings/audit', '17-audit', 'select'], ['/settings/about', '17-about', 'table']]) {
      await ctx.go(href);
      await sleep(2200);
      await ctx.shot(id, { marks: [page.locator(markSel).first()] });
    }
  });
}
