// Homework is an independent module: records, statuses, marks, history and its own reports. Its marks are NEVER part of an examination, and the last test here keeps it that way.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Homework, HomeworkHistoryRow, HomeworkRecordSheet, HomeworkSummaryRow, Subject } from '../app/types/api';
import {
  HOMEWORK_RECORD_STATUSES, SUB_OPTION_PREFIX, canHaveMark, classAverage, earnedPercent, handedIn, historyFigures, homeworkSubjectOptions, notRecordedCount, percentOf,
  subjectLabel, summaryNotRecorded,
} from '../app/utils/homework';
import { homeworkListTable, homeworkMarksTable, homeworkSummaryTable } from '../app/utils/reportTables';

const t = (key: string, params?: Record<string, unknown>): string => (params ? `${key}:${JSON.stringify(params)}` : key);

const hw = (over: Partial<Homework> = {}): Homework => ({
  id: 1, classId: 1, className: 'ក', gradeName: 'ថ្នាក់ទី ១', subjectId: 5, subjectName: 'គណិតវិទ្យា', parentSubjectId: null, parentSubjectName: null, title: 'លំហាត់', description: null,
  assignedDate: '2026-11-02', dueDate: '2026-11-04', status: 'ASSIGNED', remark: null, version: 0, maxScore: 10, studentCount: 3, submittedCount: 1, lateCount: 1, notSubmittedCount: 1,
  excusedCount: 0, markedCount: 2, scoreSum: 14.5, ...over,
});

const subject = (id: number, nameKm: string, parentId: number | null, active = true): Subject => ({ id, code: `S${id}`, nameKm, nameEn: null, parentId, active, sortOrder: id, version: 0, inUse: false } as Subject);

describe('what a student did with an assignment', () => {
  it('has four statuses; only handed-in work can have a mark', () => {
    expect(HOMEWORK_RECORD_STATUSES).toEqual(['SUBMITTED', 'LATE', 'NOT_SUBMITTED', 'EXCUSED']);
    expect(canHaveMark('SUBMITTED')).toBe(true);
    expect(canHaveMark('LATE')).toBe(true);
    expect(canHaveMark('NOT_SUBMITTED')).toBe(false);
    expect(canHaveMark('EXCUSED')).toBe(false);
    expect(canHaveMark('')).toBe(false);
    expect(canHaveMark(null)).toBe(false);
  });
});

describe('subject label and figures of one assignment', () => {
  it('shows a sub-subject under its main subject', () => {
    expect(subjectLabel({ subjectName: 'គណិតវិទ្យា', parentSubjectName: null })).toBe('គណិតវិទ្យា');
    expect(subjectLabel({ subjectName: 'ផ្នែក ១', parentSubjectName: 'មុខវិជ្ជាក្រុម' })).toBe('មុខវិជ្ជាក្រុម › ផ្នែក ១');
  });

  it('works out a percentage of the maximum, and nothing when there is no usable maximum', () => {
    expect(percentOf(8.5, 10)).toBe(85);
    expect(percentOf(7, 9)).toBe(77.78);
    expect(percentOf(5, null)).toBeNull();
    expect(percentOf(5, 0)).toBeNull();
  });

  it('averages only the marks that were entered, as a percentage of the maximum', () => {
    expect(classAverage(hw())).toBe(72.5);                       // (8.5 + 6) / (2 x 10)
    expect(classAverage(hw({ markedCount: 0, scoreSum: 0 }))).toBeNull();
    expect(classAverage(hw({ maxScore: null }))).toBeNull();      // a homework without marks has no average
  });

  it('counts who handed it in and who has no status yet; a student not handed in is not a zero in any figure', () => {
    expect(handedIn(hw())).toBe(2);
    expect(notRecordedCount(hw())).toBe(0);
    expect(notRecordedCount(hw({ studentCount: 5 }))).toBe(2);
    expect(notRecordedCount(hw({ studentCount: 1 }))).toBe(0);   // never negative
    // the sum of marks is exactly what was entered: the not-submitted student adds nothing (no zero)
    expect(hw().scoreSum).toBe(14.5);
  });
});

describe('a student over a period', () => {
  const row = (over: Partial<HomeworkSummaryRow> = {}): HomeworkSummaryRow => ({ enrollmentId: 1, studentId: 1, studentCode: 'S1', nameKm: 'កក', assigned: 4, submitted: 1, late: 1, notSubmitted: 1, excused: 0, marked: 2, earned: 13, possible: 20, ...over });

  it('shows the marks earned out of the marks possible, over the marked assignments only', () => {
    expect(earnedPercent(row())).toBe(65);
    expect(earnedPercent(row({ earned: 0, possible: 0, marked: 0 }))).toBeNull();
    expect(summaryNotRecorded(row())).toBe(1);
    expect(summaryNotRecorded(row({ assigned: 2 }))).toBe(0);
  });

  it('keeps a student who handed nothing in out of the percentage instead of counting a 0', () => {
    // two assignments, one handed in (8 of 10), one not handed in: the percentage is 80, not 40
    expect(earnedPercent(row({ assigned: 2, submitted: 1, late: 0, notSubmitted: 1, marked: 1, earned: 8, possible: 10 }))).toBe(80);
  });
});

describe('the history of one student', () => {
  const line = (over: Partial<HomeworkHistoryRow>): HomeworkHistoryRow => ({
    homeworkId: 1, title: 'ក', classId: 1, className: 'ក', gradeName: 'ថ្នាក់ទី ១', yearName: 'ឆ្នាំ', subjectId: 1, subjectName: 'ខ្មែរ', parentSubjectName: null, assignedDate: '2026-11-01',
    dueDate: '2026-11-02', homeworkStatus: 'DONE', maxScore: 10, status: null, score: null, remark: null, ...over,
  });

  it('counts by status, adds up the marks of the marked ones, and leaves a cancelled assignment out', () => {
    const figures = historyFigures([
      line({ homeworkId: 1, status: 'SUBMITTED', score: 8 }),
      line({ homeworkId: 2, status: 'NOT_SUBMITTED' }),
      line({ homeworkId: 3, status: 'LATE', score: 5 }),
      line({ homeworkId: 4, homeworkStatus: 'CANCELLED', status: 'SUBMITTED', score: 10 }),
      line({ homeworkId: 5 }),
    ]);
    expect(figures).toMatchObject({ assigned: 4, submitted: 1, late: 1, notSubmitted: 1, excused: 0, notRecorded: 1, marked: 2, earned: 13, possible: 20, percent: 65 });
  });

  it('has no percentage when nothing was marked, and a mark on a homework without a maximum is not counted', () => {
    expect(historyFigures([line({ status: 'SUBMITTED' })]).percent).toBeNull();
    expect(historyFigures([line({ status: 'SUBMITTED', score: 3, maxScore: null })])).toMatchObject({ marked: 0, earned: 0, possible: 0, percent: null });
    expect(historyFigures([])).toMatchObject({ assigned: 0, percent: null });
  });
});

describe('the subjects a homework can be about', () => {
  const list = [subject(1, 'ខ្មែរ', null), subject(2, 'គណិត', null), subject(3, 'ផ្នែក ក', 2), subject(4, 'ផ្នែក ខ', 2, false), subject(5, 'វិទ្យាសាស្ត្រ', null, false)];

  it('lists each main subject with its sub-subjects under it, leaving out what is switched off', () => {
    const options = homeworkSubjectOptions(list, null);
    expect(options.map((o) => o.value)).toEqual([1, 2, 3]);
    expect(options.filter((o) => o.sub).map((o) => o.label)).toEqual([`${SUB_OPTION_PREFIX}ផ្នែក ក`]);
    expect(options.every((o) => (o.sub ? o.label.startsWith(SUB_OPTION_PREFIX) : !o.label.startsWith(SUB_OPTION_PREFIX)))).toBe(true);
  });

  it('keeps the subject an old homework already has, and its main subject, even when it is switched off now', () => {
    expect(homeworkSubjectOptions(list, 5).map((o) => o.value)).toContain(5);
    expect(homeworkSubjectOptions(list, 4).map((o) => o.value)).toEqual([1, 2, 3, 4]);
  });

  it('lists everything for a filter', () => {
    expect(homeworkSubjectOptions(list, null, true).map((o) => o.value).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('the homework reports', () => {
  it('lists the assignments of a class: one row each, with the statuses and the class average, and says it is not part of the examination', () => {
    const table = homeworkListTable(t, [hw(), hw({ id: 2, title: 'ឥតពិន្ទុ', maxScore: null, markedCount: 0, scoreSum: 0, parentSubjectName: 'មុខវិជ្ជា', subjectName: 'ផ្នែក' })], 'ថ្នាក់ទី ១ ក', 'ពី → ដល់', 'មុខវិជ្ជា: ក');
    expect(table.title).toBe('reports.homework.title');
    expect(table.subtitle).toContain('reports.homework.notExam');
    expect(table.columns).toHaveLength(13);
    expect(table.rows.every((r) => r.length === table.columns.length)).toBe(true);
    expect(table.rows[0]).toEqual([1, '2026-11-04', 'គណិតវិទ្យា', 'លំហាត់', 'homework.status.ASSIGNED', 10, 3, 1, 1, 1, 0, 2, 72.5]);
    expect(table.rows[1]![2]).toBe('មុខវិជ្ជា › ផ្នែក');
    expect(table.rows[1]![5]).toBeNull();      // no maximum
    expect(table.rows[1]![11]).toBeNull();     // no marks to count
    expect(table.rows[1]![12]).toBeNull();     // no average
  });

  const sheet = (): HomeworkRecordSheet => ({
    homework: hw(),
    rows: [
      { enrollmentId: 2, studentId: 2, studentCode: 'S2', nameKm: 'ខខ', status: 'LATE', score: 6, remark: null },
      { enrollmentId: 1, studentId: 1, studentCode: 'S1', nameKm: 'កក', status: 'SUBMITTED', score: 8.5, remark: 'ល្អ' },
      { enrollmentId: 3, studentId: 3, studentCode: 'S3', nameKm: 'គគ', status: 'NOT_SUBMITTED', score: null, remark: null },
      { enrollmentId: 4, studentId: 4, studentCode: 'S4', nameKm: 'ឃឃ', status: null, score: null, remark: null },
    ],
  });

  it('lists the students of one assignment in Khmer name order: status, mark, percentage, remark; a blank status stays blank and a missing mark is never 0', () => {
    const table = homeworkMarksTable(t, sheet(), 'ថ្នាក់ទី ១ ក');
    expect(table.subtitle).toContain('reports.homework.notExam');
    expect(table.rows.map((r) => r[2])).toEqual(['កក', 'ខខ', 'គគ', 'ឃឃ']);
    expect(table.rows[0]).toEqual([1, 'S1', 'កក', 'homework.record.SUBMITTED', 8.5, 85, 'ល្អ']);
    expect(table.rows[2]).toEqual([3, 'S3', 'គគ', 'homework.record.NOT_SUBMITTED', null, null, null]);
    expect(table.rows[3]).toEqual([4, 'S4', 'ឃឃ', null, null, null, null]);
  });

  it('shows no percentage for a homework without a maximum', () => {
    const s = sheet();
    s.homework = hw({ maxScore: null });
    s.rows = [{ enrollmentId: 1, studentId: 1, studentCode: 'S1', nameKm: 'កក', status: 'SUBMITTED', score: null, remark: null }];
    expect(homeworkMarksTable(t, s, 'ក').rows[0]).toEqual([1, 'S1', 'កក', 'homework.record.SUBMITTED', null, null, null]);
    expect(homeworkMarksTable(t, s, 'ក').subtitle).toContain('homework.noMarks');
  });

  it('summarises each student over a period: counts, not recorded, and marks earned out of possible; a student with nothing marked has no marks and no percentage (not a zero)', () => {
    const rows: HomeworkSummaryRow[] = [
      { enrollmentId: 2, studentId: 2, studentCode: 'S2', nameKm: 'ខខ', assigned: 2, submitted: 0, late: 0, notSubmitted: 1, excused: 0, marked: 0, earned: 0, possible: 0 },
      { enrollmentId: 1, studentId: 1, studentCode: 'S1', nameKm: 'កក', assigned: 4, submitted: 1, late: 1, notSubmitted: 1, excused: 0, marked: 2, earned: 13, possible: 20 },
    ];
    const table = homeworkSummaryTable(t, rows, 'ថ្នាក់ទី ១ ក', 'ពី → ដល់', null);
    expect(table.subtitle).toContain('reports.homework.notExam');
    expect(table.subtitle).toContain('reports.homeworkSummary.method');
    expect(table.columns).toHaveLength(12);
    expect(table.rows[0]).toEqual([1, 'S1', 'កក', 4, 1, 1, 1, 0, 1, 13, 20, 65]);
    expect(table.rows[1]).toEqual([2, 'S2', 'ខខ', 2, 0, 0, 1, 0, 1, null, null, null]);
  });
});

describe('homework marks are never part of an examination', () => {
  // The files that work out or print an examination's results, ranks, report cards, roll of honour and monthly ranking must not know homework exists.
  const APP = path.resolve(__dirname, '..', 'app');
  const files = [
    'utils/monthlyRanking.ts', 'utils/honorRoll.ts', 'utils/reportCardOptions.ts', 'utils/sampleReportCard.ts', 'utils/score.ts', 'utils/exam.ts',
    'services/examsApi.ts', 'services/reportCardsApi.ts', 'components/print/ReportCardSheet.vue', 'components/print/RankingSheet.vue', 'components/print/HonorRollSheet.vue',
    'pages/print/report-cards.vue', 'pages/print/monthly-ranking.vue', 'pages/print/honor-roll.vue', 'pages/monthly-ranking/index.vue', 'pages/honor-roll/index.vue', 'pages/report-cards/index.vue',
  ];
  const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)])) : []);

  it('none of the examination, report-card, ranking or roll-of-honour code mentions homework', () => {
    const all = [...files.map((f) => path.join(APP, f)).filter(existsSync), ...walk(path.join(APP, 'components', 'exams')), ...walk(path.join(APP, 'components', 'reportCards'))];
    expect(all.length).toBeGreaterThan(8);   // the scan itself found the files
    const mentions = all.filter((f) => /homework/i.test(readFileSync(f, 'utf8'))).map((f) => path.relative(APP, f));
    expect(mentions).toEqual([]);
  });
});
