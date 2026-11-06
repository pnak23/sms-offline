// Subjects with sub-subjects (two levels): the tree the screens build from the flat list, what switching a main subject off for a grade takes with it,
// and the sample report card's sub-subject detail adding up like a real one.
import { describe, expect, it } from 'vitest';
import type { Subject } from '../app/types/api';
import { sampleReportCard } from '../app/utils/sampleReportCard';
import { idsWithout, isMain, subjectTree } from '../app/utils/subjectTree';

let nextId = 1;
const subject = (nameKm: string, parentId: number | null = null, over: Partial<Subject> = {}): Subject => ({
  id: nextId++, code: `S-${nextId}`, nameKm, nameEn: null, parentId, active: true, version: 0, inUse: false, ...over,
});

describe('subjectTree', () => {
  it('puts each main subject first with its sub-subjects below it, in the order of the list', () => {
    const khmer = subject('ភាសាខ្មែរ');
    const maths = subject('គណិតវិទ្យា');
    const reading = subject('អាន', khmer.id);
    const art = subject('សិល្បៈ');
    const writing = subject('សរសេរ', khmer.id);
    const tree = subjectTree([khmer, maths, reading, art, writing]);
    expect(tree.map((n) => n.subject.nameKm)).toEqual(['ភាសាខ្មែរ', 'គណិតវិទ្យា', 'សិល្បៈ']);
    expect(tree[0]!.subs.map((s) => s.nameKm)).toEqual(['អាន', 'សរសេរ']);
    expect(tree[1]!.subs).toEqual([]);
    expect(tree[2]!.subs).toEqual([]);
  });

  it('leaves out a sub-subject whose main subject is not in the list, and never lists a sub-subject as a main subject', () => {
    const orphan = subject('ក្មេងកំព្រា', 999);
    const main = subject('មេ');
    const tree = subjectTree([orphan, main]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.subject.id).toBe(main.id);
    expect(isMain(main)).toBe(true);
    expect(isMain(orphan)).toBe(false);
  });

  it('is empty for an empty list', () => {
    expect(subjectTree([])).toEqual([]);
  });
});

describe('idsWithout (switching a subject off for one grade)', () => {
  const main = subject('មេ');
  const a = subject('ក', main.id);
  const b = subject('ខ', main.id);
  const other = subject('ផ្សេង');
  const otherSub = subject('ក្រោមផ្សេង', other.id);
  const all = [main, a, b, other, otherSub];
  const grade = [main.id, a.id, b.id, other.id, otherSub.id];

  it('takes the sub-subjects of a main subject with it', () => {
    expect(idsWithout(all, grade, main)).toEqual([other.id, otherSub.id]);
  });

  it('takes only the one sub-subject when a sub-subject is switched off', () => {
    expect(idsWithout(all, grade, a)).toEqual([main.id, b.id, other.id, otherSub.id]);
  });

  it('leaves the set alone when the subject was not in it', () => {
    expect(idsWithout(all, [other.id], main)).toEqual([other.id]);
  });
});

describe('the sample report card', () => {
  const t = (key: string): string => key;

  it('has a main subject made of sub-subjects whose maxima and scores add up to the main subject\'s, and no sub-subjects on the others', () => {
    const card = sampleReportCard(t, 5);
    const first = card.subjects[0]!;
    expect(first.subSubjects).toHaveLength(2);
    expect(first.subSubjects.reduce((sum, s) => sum + s.maxScore, 0)).toBe(first.maxScore);
    expect(first.subSubjects.reduce((sum, s) => sum + (s.score ?? 0), 0)).toBe(first.score);
    for (const other of card.subjects.slice(1)) expect(other.subSubjects).toEqual([]);
  });

  it('counts only main subjects in the total, so the sub-subjects are never added on top', () => {
    const card = sampleReportCard(t, 5);
    expect(card.total).toBe(card.subjects.reduce((sum, s) => sum + (s.score ?? 0), 0));
    expect(card.totalMax).toBe(card.subjects.reduce((sum, s) => sum + s.maxScore, 0));
  });
});
