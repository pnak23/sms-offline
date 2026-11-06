import type { Subject } from '../types/api';

// The school's subjects have two levels: a MAIN subject (parentId null) and, under it, its SUB-SUBJECTS. This turns the flat list the backend sends into
// that tree. Everything that must offer main subjects only (homework, the teachers of a class) filters with `isMain`.

export interface SubjectNode {
  subject: Subject;
  /** The main subject's sub-subjects, in the order of the list. Empty for a subject with none. */
  subs: Subject[];
}

export const isMain = (subject: Pick<Subject, 'parentId'>): boolean => subject.parentId === null;

/** Main subjects in the order of the list, each followed by its sub-subjects. A sub-subject whose main subject is not in the list is left out. */
export function subjectTree(subjects: readonly Subject[]): SubjectNode[] {
  return subjects.filter(isMain).map((subject) => ({ subject, subs: subjects.filter((s) => s.parentId === subject.id) }));
}

/** The ids to keep in a grade's set when `subject` is switched off for that grade: a main subject takes its sub-subjects with it. */
export function idsWithout(subjects: readonly Subject[], ids: readonly number[], subject: Subject): number[] {
  const drop = new Set<number>([subject.id, ...subjects.filter((s) => s.parentId === subject.id).map((s) => s.id)]);
  return ids.filter((id) => !drop.has(id));
}
