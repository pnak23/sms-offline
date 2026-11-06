// The Khmer review tooling (scripts/lib/khmerReview.mjs): what a reviewer's correction may and may not change, the all-or-nothing rule, and the comparison of sources.
// Run with the other desktop unit tests: npm run test:desktop
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SECTIONS, applyCorrections, diffManifests, flatten, onlyKhmerWording, outcomeMarkdown, placeholders, problemsOf, sectionKeys, sheetMarkdown } from '../../scripts/lib/khmerReview.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
const realKm = JSON.parse(readFileSync(path.join(root, 'frontend', 'i18n', 'locales', 'km.json'), 'utf8'));
const km = () => ({
  timetable: { title: 'ក', lessons: '{n} មេរៀន', clash: 'ថ្នាក់ {className} ថ្ងៃ{day}', empty: 'ទទេ' },
  nav: { timetable: 'កាលវិភាគ', students: 'សិស្ស' },
  error: { TIMETABLE_TEACHER_CLASH: 'ជាន់គ្នា', NOT_FOUND: 'រកមិនឃើញ' },
});

test('section 19 covers every timetable text of the real km.json and nothing about other pages', () => {
  const keys = sectionKeys(realKm, 19);
  assert.ok(keys.length >= 100, `${keys.length} texts`);
  for (const must of ['nav.timetable', 'timetable.title', 'timetable.skip.TEACHER_CLASH', 'timetable.clash', 'error.TIMETABLE_TEACHER_CLASH', 'validation.TIMETABLE_SLOT_OVERLAP', 'audit.action.TIMETABLE_LESSON_SET', 'audit.entity.timetable_entry', 'acceptance.draft.timetableSlots', 'acceptance.item.timetable-slots.title', 'reports.timetableClass.title', 'students.timetableTitle', 'teachers.timetableTitle']) {
    assert.ok(keys.includes(must), `${must} is in the section`);
  }
  assert.ok(!keys.includes('nav.students') && !keys.includes('error.NOT_FOUND') && !keys.includes('attendancePeriods.title'));
  assert.ok(SECTIONS[19].match('timetable.day.1') && !SECTIONS[19].match('nav.attendance'));
});

test('section 20 covers every dashboard text (the hero and the six charts) of the real km.json and nothing else, and 19 and 20 never overlap', () => {
  const keys = sectionKeys(realKm, 20);
  assert.ok(keys.length >= 60, `${keys.length} texts`);
  for (const must of ['dashboard.hero.takeAttendance', 'dashboard.charts.title', 'dashboard.charts.noYear', 'dashboard.charts.grades.title', 'dashboard.charts.gender.summary', 'dashboard.charts.attendance.gap', 'dashboard.charts.fill.note', 'dashboard.charts.exam.unofficial', 'dashboard.charts.fees.summary', 'dashboard.backupLimitsToggle']) {
    assert.ok(keys.includes(must), `${must} is in the section`);
  }
  // the label of the quiet backup line's information button is the ONE backup text that belongs to this review; the sentence it opens (`dashboard.backupLimits`) is unchanged and stays in section 18
  assert.ok(!keys.includes('dashboard.backupLimits') && !SECTIONS[20].match('dashboard.backupLimits') && !SECTIONS[20].match('dashboard.backupOpen'));
  // the figure tiles and the cards that were on the dashboard before are not part of this review, and neither is anything of the timetable
  assert.ok(!keys.includes('dashboard.students') && !keys.includes('dashboard.backupTitle') && !keys.includes('nav.dashboard') && !keys.some((k) => k.includes('timetable')));
  const timetable = new Set(sectionKeys(realKm, 19));
  assert.ok(keys.every((k) => !timetable.has(k)), 'no text is in both sections');
  // every text the sheet tells the reviewer to look at first really exists
  const flat = flatten(realKm);
  for (const named of SECTIONS[20].focus.match(/`dashboard\.charts\.[a-zA-Z.]+`/g)) assert.ok(flat[named.slice(1, -1)] !== undefined, `${named} exists`);
});

test('one review of sections 19 and 20 together: one sheet with both, a correction in either part is accepted, a text of neither is refused', () => {
  const both = sectionKeys(realKm, [19, 20]);
  assert.equal(both.length, sectionKeys(realKm, 19).length + sectionKeys(realKm, 20).length);
  const sheet = sheetMarkdown(realKm, [19, 20]);
  assert.match(sheet, /weekly timetable/);
  assert.match(sheet, /premium dashboard/);
  assert.ok(sheet.includes('`dashboard.charts.attendance.gap`') && sheet.includes('`timetable.clash`'));
  const flat = flatten(realKm);
  const dashboardKey = 'dashboard.charts.attendance.gap';
  const ok = applyCorrections(realKm, { [dashboardKey]: `${flat[dashboardKey]}។`, 'timetable.title': `${flat['timetable.title']}`.trim() }, { sectionId: [19, 20] });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.changes.length, 1);                                    // the identical correction changed nothing
  assert.match(applyCorrections(realKm, { 'nav.students': 'សិស្សថ្មី' }, { sectionId: [19, 20] }).problems[0], /not part of section 19-20/);
  assert.match(applyCorrections(realKm, { 'dashboard.students': 'សិស្សថ្មី' }, { sectionId: [19, 20] }).problems[0], /not part of section 19-20/);   // an older dashboard text is outside the review
  assert.match(outcomeMarkdown({ sectionId: [19, 20], reviewer: 'R', date: 'd', changes: [], unchanged: [], total: both.length }), /weekly timetable.*premium dashboard/);
});

test('the words in braces are the program\'s: a correction must keep exactly the same ones', () => {
  assert.deepEqual(placeholders('{n} មេរៀន {day}'), ['day', 'n']);
  assert.deepEqual(problemsOf('k', '{n} មេរៀន', '{n} មេរៀនក្នុងសប្តាហ៍'), []);
  assert.equal(problemsOf('k', '{n} មេរៀន', 'មេរៀន').length, 1);          // lost a placeholder
  assert.equal(problemsOf('k', '{n} មេរៀន', '{m} មេរៀន').length, 1);      // renamed one
  assert.equal(problemsOf('k', '{n} មេរៀន', '{n} {n} មេរៀន').length, 1);  // doubled one
  assert.equal(problemsOf('k', 'ក', '   ').length, 1);                     // empty
  assert.equal(problemsOf('k', 'ក', null).length, 1);
});

test('a correction may not bring in what the message format treats specially', () => {
  for (const bad of ['ក | ខ', 'ក @:nav.x', 'ក <b>ខ</b>', 'ក\nខ', 'ក\u0001ខ']) assert.ok(problemsOf('k', 'ក', bad).length >= 1, JSON.stringify(bad));
  assert.deepEqual(problemsOf('k', 'ក | ខ', 'ក | គ'), []);   // a text that already had one keeps it: only NEW ones are refused
});

test('applying: only the corrected texts change, and the original object is left alone', () => {
  const before = km();
  const r = applyCorrections(before, { 'timetable.title': 'កាលវិភាគប្រចាំសប្តាហ៍', 'timetable.lessons': '{n} មេរៀន' }, { sectionId: 19 });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.changes.map((c) => c.key), ['timetable.title']);
  assert.deepEqual(r.unchanged, ['timetable.lessons']);
  assert.equal(r.km.timetable.title, 'កាលវិភាគប្រចាំសប្តាហ៍');
  assert.deepEqual({ ...r.km, timetable: { ...r.km.timetable, title: 'ក' } }, km());        // nothing else moved
  assert.equal(before.timetable.title, 'ក');
});

test('applying is ALL OR NOTHING: one problem and no text changes', () => {
  const r = applyCorrections(km(), { 'timetable.title': 'ខ្ញុំ', 'timetable.lessons': 'មេរៀន' }, { sectionId: 19 });   // the second loses {n}
  assert.equal(r.problems.length, 1);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.km, km());
});

test('a key that does not exist is refused (a typo never creates a text), and so is one outside the section unless --any-key', () => {
  assert.match(applyCorrections(km(), { 'timetable.titel': 'ក' }, { sectionId: 19 }).problems[0], /no such text/);
  assert.match(applyCorrections(km(), { 'nav.students': 'សិស្សថ្មី' }, { sectionId: 19 }).problems[0], /not part of section 19/);
  const open = applyCorrections(km(), { 'nav.students': 'សិស្សថ្មី' }, { sectionId: 19, anyKey: true });
  assert.deepEqual(open.problems, []);
  assert.equal(open.km.nav.students, 'សិស្សថ្មី');
});

test('the sheet for the reviewer has every text of the section IN FULL, and the report shows before and after', () => {
  const sheet = sheetMarkdown(realKm, 19);
  const flat = flatten(realKm);
  for (const key of sectionKeys(realKm, 19)) assert.ok(sheet.includes(`\`${key}\``) && sheet.includes(flat[key].replace(/\|/g, '\\|')), key);
  assert.match(sheet, /AI assistant, not by a Khmer speaker/);
  const report = outcomeMarkdown({ sectionId: 19, reviewer: 'A. Reviewer', date: '2026-11-07', changes: [{ key: 'timetable.title', before: 'ក', after: 'ខ' }], unchanged: [], total: 120 });
  assert.match(report, /Corrected: 1\./);
  assert.match(report, /\| `timetable.title` \| ក \| ខ \|/);
  assert.match(outcomeMarkdown({ sectionId: 19, reviewer: '', date: 'd', changes: [], unchanged: [], total: 5 }), /Nothing was changed\./);
});

test('comparing two looks at the sources says what changed, and whether ONLY the Khmer wording did', () => {
  const a = { 'x/one.ts': '1', 'frontend/i18n/locales/km.json': 'a', 'y/gone.ts': '3' };
  const b = { 'x/one.ts': '1', 'frontend/i18n/locales/km.json': 'b', 'z/new.ts': '4' };
  const d = diffManifests(a, b);
  assert.deepEqual(d, { added: ['z/new.ts'], removed: ['y/gone.ts'], changed: ['frontend/i18n/locales/km.json'] });
  assert.equal(onlyKhmerWording(d), false);
  assert.equal(onlyKhmerWording(diffManifests({ 'frontend/i18n/locales/km.json': 'a', 'frontend/i18n/REVIEW.md': 'a', 'k.ts': '1' }, { 'frontend/i18n/locales/km.json': 'b', 'frontend/i18n/REVIEW.md': 'b', 'k.ts': '1' })), true);
  assert.equal(onlyKhmerWording(diffManifests(a, a)), true);
});
