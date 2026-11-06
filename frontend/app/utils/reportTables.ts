import type { AttendanceBasis, AttendanceSummaryRow, ExamResults, FeeClassSummary, FeeCurrency, Homework, HomeworkRecordSheet, HomeworkSummaryRow, ReportTable, RosterRow, StudentResult, StudentRow, Teacher } from '../types/api';
import { columnLabels, countsOf } from './attendance';
import { formatDateKm } from './date';
import { classAverage, earnedPercent, percentOf, subjectLabel, summaryNotRecorded } from './homework';
import { formatNumber } from './score';
import { compareKhmer, sortByKhmer } from './sort';

// Each report is built here as ONE table; the preview, the printed A4 page and the Excel file all show that same table, so they cannot
// disagree. Pure functions of data and a translator (`t`), so they are unit-tested without a browser.
export type Translate = (key: string, params?: Record<string, unknown>) => string;

const NO = (t: Translate) => ({ label: t('print.attendance.number'), type: 'INTEGER' as const, width: 6 });
const joinLine = (...parts: (string | null | undefined)[]): string => parts.filter((p): p is string => !!p && p.trim() !== '').join(' · ');

export function studentListTable(t: Translate, rows: StudentRow[], context: string): ReportTable {
  const sorted = sortByKhmer(rows, (r) => r.nameKm);
  return {
    sheetName: t('reports.students.sheet'),
    title: t('reports.students.title'),
    subtitle: joinLine(context, t('students.count', { n: rows.length })),
    columns: [
      NO(t),
      { label: t('students.code'), type: 'TEXT', width: 14 },
      { label: t('students.nameKm'), type: 'TEXT', width: 26 },
      { label: t('students.nameEn'), type: 'TEXT', width: 24 },
      { label: t('common.gender'), type: 'TEXT', width: 10 },
      { label: t('students.dateOfBirth'), type: 'DATE', width: 14 },
      { label: t('students.class'), type: 'TEXT', width: 18 },
      { label: t('common.status'), type: 'TEXT', width: 14 },
    ],
    rows: sorted.map((r, i) => [i + 1, r.studentCode, r.nameKm, r.nameEn, t(`gender.${r.gender}`), r.dateOfBirth, [r.gradeName, r.className].filter(Boolean).join(' ') || null, t(`studentStatus.${r.status}`)]),
  };
}

export function classRosterTable(t: Translate, roster: RosterRow[], className: string, yearName: string): ReportTable {
  const sorted = sortByKhmer(roster, (r) => r.nameKm);
  return {
    sheetName: t('reports.roster.sheet'),
    title: t('reports.roster.title'),
    subtitle: joinLine(className, yearName, t('students.count', { n: roster.length })),
    columns: [
      NO(t),
      { label: t('students.code'), type: 'TEXT', width: 14 },
      { label: t('students.nameKm'), type: 'TEXT', width: 26 },
      { label: t('students.nameEn'), type: 'TEXT', width: 24 },
      { label: t('common.gender'), type: 'TEXT', width: 10 },
      { label: t('students.dateOfBirth'), type: 'DATE', width: 14 },
      { label: t('students.enrollmentDate'), type: 'DATE', width: 14 },
    ],
    rows: sorted.map((r, i) => [i + 1, r.studentCode, r.nameKm, r.nameEn, t(`gender.${r.gender}`), r.dateOfBirth, r.enrolledOn]),
  };
}

/**
 * Per student, counted by DAYS (each date once; present, late, partial, absent, leave) or by SESSIONS (every sheet; present, absent, late, leave).
 * Every count column says its unit, and so does the subtitle: a printed page or an Excel file has nowhere else to say what is being counted.
 * `recorded` is the number of days (or of sheets) that fell in the period.
 */
export function attendanceTable(t: Translate, rows: AttendanceSummaryRow[], className: string, periodText: string, recorded: number, basis: AttendanceBasis): ReportTable {
  const sorted = sortByKhmer(rows, (r) => r.nameKm);
  const labels = columnLabels(t, basis);
  return {
    sheetName: t('reports.attendance.sheet'),
    title: t('print.attendance.title'),
    subtitle: joinLine(className, periodText, t(basis === 'DAY' ? 'reports.attendance.days' : 'reports.attendance.sessions', { days: recorded, sessions: recorded }), t(`attendance.basis.${basis}`)),
    columns: [
      NO(t),
      { label: t('students.code'), type: 'TEXT', width: 14 },
      { label: t('students.nameKm'), type: 'TEXT', width: 26 },
      ...labels.map((label) => ({ label, type: 'INTEGER' as const, width: 14 })),
    ],
    rows: sorted.map((r, i) => [i + 1, r.studentCode, r.nameKm, ...countsOf(r, basis)]),
  };
}

/**
 * Results of one class. By rank: students with a rank first (the best first; students who share a rank stay in Khmer name order), then
 * those with an incomplete result in name order. By name: Khmer alphabetical. A subject the student missed is an empty cell and is named in
 * the last column (a number column cannot hold the word "absent" and stay a number in Excel).
 */
export function resultsTable(t: Translate, results: ExamResults, context: { examName: string; className: string }, order: 'rank' | 'name'): ReportTable {
  const byName = sortByKhmer(results.students, (s) => s.nameKm);
  const students: StudentResult[] =
    order === 'name'
      ? byName
      : [...byName].sort((a, b) => (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0) || (a.rank ?? 0) - (b.rank ?? 0) || compareKhmer(a.nameKm, b.nameKm));
  const outcome = (s: StudentResult): string => (!s.complete ? t('exams.incomplete') : s.passed ? t('exams.passed') : t('exams.failed'));
  return {
    sheetName: t('reports.results.sheet'),
    title: t('reports.results.title'),
    subtitle: joinLine(context.examName, context.className, t('exams.passMarkIs', { percent: formatNumber(results.passPercent) })),
    columns: [
      { label: t('exams.rank'), type: 'INTEGER', width: 10 },
      { label: t('students.code'), type: 'TEXT', width: 14 },
      { label: t('students.nameKm'), type: 'TEXT', width: 26 },
      ...results.subjects.map((s) => ({ label: `${s.subjectName} (${formatNumber(s.maxScore)})`, type: 'DECIMAL' as const, width: 14 })),
      { label: t('exams.total'), type: 'DECIMAL', width: 12 },
      { label: t('reports.results.totalMax'), type: 'DECIMAL', width: 12 },
      { label: t('exams.percent'), type: 'DECIMAL', width: 10 },
      { label: t('exams.band'), type: 'TEXT', width: 18 },
      { label: t('exams.outcome'), type: 'TEXT', width: 14 },
      { label: t('reports.results.notes'), type: 'TEXT', width: 28 },
    ],
    rows: students.map((s) => {
      const missed = results.subjects.filter((sub) => s.scores.find((sc) => sc.examSubjectId === sub.examSubjectId)?.absent).map((sub) => sub.subjectName);
      return [
        s.rank,
        s.studentCode,
        s.nameKm,
        ...results.subjects.map((sub) => s.scores.find((sc) => sc.examSubjectId === sub.examSubjectId)?.score ?? null),
        s.total,
        s.totalMax,
        s.percent,
        s.bandLetter ? `${s.bandLetter} · ${s.bandLabel}` : null,
        outcome(s),
        missed.length > 0 ? `${t('exams.absent')}: ${missed.join(', ')}` : null,
      ];
    }),
  };
}

export function teachersTable(t: Translate, teachers: Teacher[], context: string): ReportTable {
  const sorted = sortByKhmer(teachers, (r) => r.nameKm);
  return {
    sheetName: t('reports.teachers.sheet'),
    title: t('reports.teachers.title'),
    subtitle: joinLine(context, t('students.count', { n: teachers.length })),
    columns: [
      NO(t),
      { label: t('teachers.code'), type: 'TEXT', width: 12 },
      { label: t('students.nameKm'), type: 'TEXT', width: 26 },
      { label: t('common.gender'), type: 'TEXT', width: 10 },
      { label: t('common.phone'), type: 'TEXT', width: 16 },
      { label: t('teachers.specialization'), type: 'TEXT', width: 22 },
      { label: t('teachers.employmentDate'), type: 'DATE', width: 14 },
      { label: t('common.status'), type: 'TEXT', width: 14 },
    ],
    rows: sorted.map((r, i) => [i + 1, r.teacherCode, r.nameKm, t(`gender.${r.gender}`), r.phone, r.specialization, r.employmentDate, t(`teacherStatus.${r.status}`)]),
  };
}

/** Per student: due, paid and still due, for each currency that appears (one set of three columns per currency). */
export function feesTable(t: Translate, summary: FeeClassSummary, className: string, currencies: readonly FeeCurrency[]): ReportTable {
  const present = currencies.filter((c) => summary.totals.some((x) => x.currency === c));
  const shown: FeeCurrency[] = present.length > 0 ? present : [currencies[0] ?? 'KHR'];
  const sorted = sortByKhmer(summary.rows, (r) => r.nameKm);
  const multi = shown.length > 1;
  const label = (key: string, currency: FeeCurrency): string => (multi ? `${t(key)} (${currency})` : t(key));
  const columns = shown.flatMap((c) => [
    { label: label('fees.due', c), type: 'DECIMAL' as const, width: 14 },
    { label: label('fees.paid', c), type: 'DECIMAL' as const, width: 14 },
    { label: label('fees.balance', c), type: 'DECIMAL' as const, width: 14 },
  ]);
  const cells = (totals: { currency: FeeCurrency; due: number; paid: number; balance: number }[]) =>
    shown.flatMap((c) => {
      const x = totals.find((tot) => tot.currency === c);
      return [x?.due ?? 0, x?.paid ?? 0, x?.balance ?? 0];
    });
  return {
    sheetName: t('reports.fees.sheet'),
    title: t('reports.fees.title'),
    subtitle: joinLine(className, t('students.count', { n: summary.rows.length })),
    columns: [NO(t), { label: t('students.code'), type: 'TEXT', width: 14 }, { label: t('students.nameKm'), type: 'TEXT', width: 26 }, ...columns],
    rows: [
      ...sorted.map((r, i) => [i + 1, r.studentCode, r.nameKm, ...cells(r.totals)]),
      [null, null, t('fees.classTotal'), ...cells(summary.totals)],
    ],
  };
}

// ---- homework: an independent module. These reports are about homework only and say so; they are never part of an examination result. ----------------------------

/** The assignments of a class due in a period: how each stands (the students' submission statuses) and the class average of the marks entered. */
export function homeworkListTable(t: Translate, items: Homework[], className: string, periodText: string, subjectText: string | null): ReportTable {
  return {
    sheetName: t('reports.homework.sheet'),
    title: t('reports.homework.title'),
    subtitle: joinLine(className, periodText, subjectText, t('reports.homework.notExam')),
    columns: [
      NO(t),
      { label: t('homework.dueDate'), type: 'DATE', width: 14 },
      { label: t('exams.subject'), type: 'TEXT', width: 22 },
      { label: t('homework.titleLabel'), type: 'TEXT', width: 28 },
      { label: t('common.status'), type: 'TEXT', width: 12 },
      { label: t('homework.maxScore'), type: 'DECIMAL', width: 10 },
      { label: t('reports.homework.students'), type: 'INTEGER', width: 10 },
      { label: t('homework.record.SUBMITTED'), type: 'INTEGER', width: 12 },
      { label: t('homework.record.LATE'), type: 'INTEGER', width: 12 },
      { label: t('homework.record.NOT_SUBMITTED'), type: 'INTEGER', width: 12 },
      { label: t('homework.record.EXCUSED'), type: 'INTEGER', width: 12 },
      { label: t('homework.markedCount'), type: 'INTEGER', width: 10 },
      { label: t('homework.averagePercent'), type: 'DECIMAL', width: 12 },
    ],
    rows: items.map((h, i) => [
      i + 1, h.dueDate, subjectLabel(h), h.title, t(`homework.status.${h.status}`), h.maxScore, h.studentCount,
      h.submittedCount, h.lateCount, h.notSubmittedCount, h.excusedCount, h.maxScore === null ? null : h.markedCount, classAverage(h),
    ]),
  };
}

/** One assignment, student by student: the status, the mark (with its percentage when the assignment has a maximum) and the remark. Blank = not recorded. */
export function homeworkMarksTable(t: Translate, sheet: HomeworkRecordSheet, className: string): ReportTable {
  const h = sheet.homework;
  const rows = sortByKhmer(sheet.rows, (r) => r.nameKm);
  return {
    sheetName: t('reports.homeworkMarks.sheet'),
    title: t('reports.homeworkMarks.title'),
    subtitle: joinLine(h.title, subjectLabel(h), className, `${t('homework.dueDate')}: ${formatDateKm(h.dueDate)}`, h.maxScore === null ? t('homework.noMarks') : t('exams.maxIs', { max: formatNumber(h.maxScore) }), t('reports.homework.notExam')),
    columns: [
      NO(t),
      { label: t('students.code'), type: 'TEXT', width: 14 },
      { label: t('students.nameKm'), type: 'TEXT', width: 26 },
      { label: t('homework.recordStatus'), type: 'TEXT', width: 16 },
      { label: t('exams.score'), type: 'DECIMAL', width: 10 },
      { label: t('exams.percent'), type: 'DECIMAL', width: 10 },
      { label: t('homework.remark'), type: 'TEXT', width: 30 },
    ],
    rows: rows.map((r, i) => [i + 1, r.studentCode, r.nameKm, r.status ? t(`homework.record.${r.status}`) : null, r.score, r.score === null ? null : percentOf(r.score, h.maxScore), r.remark]),
  };
}

/**
 * Per student of a class over a period: how many assignments, how many were handed in on time, late, not handed in, excused, and not recorded, and the marks earned
 * out of the marks possible counting ONLY the assignments that were marked (a student who did not hand something in is never counted as 0).
 */
export function homeworkSummaryTable(t: Translate, rows: HomeworkSummaryRow[], className: string, periodText: string, subjectText: string | null): ReportTable {
  const sorted = sortByKhmer(rows, (r) => r.nameKm);
  return {
    sheetName: t('reports.homeworkSummary.sheet'),
    title: t('reports.homeworkSummary.title'),
    subtitle: joinLine(className, periodText, subjectText, t('reports.homework.notExam'), t('reports.homeworkSummary.method')),
    columns: [
      NO(t),
      { label: t('students.code'), type: 'TEXT', width: 14 },
      { label: t('students.nameKm'), type: 'TEXT', width: 26 },
      { label: t('reports.homeworkSummary.assigned'), type: 'INTEGER', width: 11 },
      { label: t('homework.record.SUBMITTED'), type: 'INTEGER', width: 12 },
      { label: t('homework.record.LATE'), type: 'INTEGER', width: 12 },
      { label: t('homework.record.NOT_SUBMITTED'), type: 'INTEGER', width: 12 },
      { label: t('homework.record.EXCUSED'), type: 'INTEGER', width: 12 },
      { label: t('reports.homeworkSummary.notRecorded'), type: 'INTEGER', width: 12 },
      { label: t('reports.homeworkSummary.earned'), type: 'DECIMAL', width: 11 },
      { label: t('reports.homeworkSummary.possible'), type: 'DECIMAL', width: 11 },
      { label: t('exams.percent'), type: 'DECIMAL', width: 10 },
    ],
    rows: sorted.map((r, i) => [i + 1, r.studentCode, r.nameKm, r.assigned, r.submitted, r.late, r.notSubmitted, r.excused, summaryNotRecorded(r), r.possible > 0 ? r.earned : null, r.possible > 0 ? r.possible : null, earnedPercent(r)]),
  };
}
