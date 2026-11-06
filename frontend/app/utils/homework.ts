import type { Homework, HomeworkHistoryRow, HomeworkRecordStatus, HomeworkSummaryRow, Subject } from '../types/api';
import { sortByKhmer } from './sort';

// Homework is an independent module: its marks are never part of an examination, so nothing here is used by the results, the ranking or the report card.
// These are the small pure functions the homework screens and reports share.

/** What a student can have done with an assignment, in the order a teacher picks from. No status at all means "not recorded yet". */
export const HOMEWORK_RECORD_STATUSES: readonly HomeworkRecordStatus[] = ['SUBMITTED', 'LATE', 'NOT_SUBMITTED', 'EXCUSED'];

/** Only work that was handed in can have a mark. */
export const canHaveMark = (status: HomeworkRecordStatus | null | ''): boolean => status === 'SUBMITTED' || status === 'LATE';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** "main subject › sub-subject" for a sub-subject, the plain name for a main subject. */
export const subjectLabel = (h: { subjectName: string; parentSubjectName: string | null }): string => (h.parentSubjectName ? `${h.parentSubjectName} › ${h.subjectName}` : h.subjectName);

/** A mark as a percentage of its maximum, two decimals; null when there is no usable maximum. */
export const percentOf = (score: number, max: number | null): number | null => (max !== null && max > 0 ? round2((score / max) * 100) : null);

/** The class average of an assignment: the mean of the marks entered, as a percentage of the maximum. Null when nothing is marked (or there is no maximum). */
export function classAverage(h: Pick<Homework, 'maxScore' | 'markedCount' | 'scoreSum'>): number | null {
  if (h.maxScore === null || h.maxScore <= 0 || h.markedCount <= 0) return null;
  return round2((h.scoreSum / (h.markedCount * h.maxScore)) * 100);
}

/** Students who handed it in (on time or late). */
export const handedIn = (h: Pick<Homework, 'submittedCount' | 'lateCount'>): number => h.submittedCount + h.lateCount;

/** Students of the class with no status recorded yet. */
export const notRecordedCount = (h: Pick<Homework, 'studentCount' | 'submittedCount' | 'lateCount' | 'notSubmittedCount' | 'excusedCount'>): number =>
  Math.max(0, h.studentCount - h.submittedCount - h.lateCount - h.notSubmittedCount - h.excusedCount);

/**
 * A student's marks over a period: the marks earned out of the marks possible, counting ONLY the assignments that were marked. A student who did not hand something
 * in is shown in the counts and is never turned into a 0 here. Null when nothing was marked.
 */
export const earnedPercent = (row: Pick<HomeworkSummaryRow, 'earned' | 'possible'>): number | null => (row.possible > 0 ? round2((row.earned / row.possible) * 100) : null);

/** Assignments of the period with no status recorded for the student. */
export const summaryNotRecorded = (row: Pick<HomeworkSummaryRow, 'assigned' | 'submitted' | 'late' | 'notSubmitted' | 'excused'>): number =>
  Math.max(0, row.assigned - row.submitted - row.late - row.notSubmitted - row.excused);

/** What a sub-subject's option starts with, so a flat <select> shows it under its main subject. */
export const SUB_OPTION_PREFIX = '  › ';

export interface SubjectOption {
  value: number;
  label: string;
  /** True for a sub-subject. */
  sub: boolean;
}

/**
 * The subjects a homework can be about: each main subject (by Khmer name) followed by its sub-subjects. Subjects that are switched off are left out, except the one the
 * homework already has (and the main subject of that one), so editing an old homework keeps it. A filter lists every subject (`includeInactive`).
 */
export function homeworkSubjectOptions(subjects: readonly Subject[], currentId: number | null, includeInactive = false): SubjectOption[] {
  const current = subjects.find((s) => s.id === currentId) ?? null;
  const keepsMain = (main: Subject): boolean => includeInactive || main.active || main.id === currentId || current?.parentId === main.id;
  const out: SubjectOption[] = [];
  for (const main of sortByKhmer(subjects.filter((s) => s.parentId === null && keepsMain(s)), (s) => s.nameKm)) {
    out.push({ value: main.id, label: main.nameKm, sub: false });
    for (const sub of sortByKhmer(subjects.filter((s) => s.parentId === main.id && (includeInactive || s.active || s.id === currentId)), (s) => s.nameKm)) {
      out.push({ value: sub.id, label: `${SUB_OPTION_PREFIX}${sub.nameKm}`, sub: true });
    }
  }
  return out;
}

/** The figures above a student's homework history. Cancelled assignments are shown in the list but not counted, like in the class summary. */
export interface HistoryFigures {
  assigned: number;
  submitted: number;
  late: number;
  notSubmitted: number;
  excused: number;
  notRecorded: number;
  marked: number;
  earned: number;
  possible: number;
  /** Marks earned out of marks possible over the marked assignments only; null when nothing was marked. A student who did not hand something in is never counted as 0. */
  percent: number | null;
}

export function historyFigures(rows: readonly Pick<HomeworkHistoryRow, 'homeworkStatus' | 'status' | 'score' | 'maxScore'>[]): HistoryFigures {
  const counted = rows.filter((r) => r.homeworkStatus !== 'CANCELLED');
  const count = (status: HomeworkRecordStatus): number => counted.filter((r) => r.status === status).length;
  const marked = counted.filter((r) => r.score !== null && r.maxScore !== null);
  const earned = round2(marked.reduce((sum, r) => sum + (r.score ?? 0), 0));
  const possible = round2(marked.reduce((sum, r) => sum + (r.maxScore ?? 0), 0));
  const submitted = count('SUBMITTED');
  const late = count('LATE');
  const notSubmitted = count('NOT_SUBMITTED');
  const excused = count('EXCUSED');
  return {
    assigned: counted.length,
    submitted,
    late,
    notSubmitted,
    excused,
    notRecorded: Math.max(0, counted.length - submitted - late - notSubmitted - excused),
    marked: marked.length,
    earned,
    possible,
    percent: possible > 0 ? round2((earned / possible) * 100) : null,
  };
}
