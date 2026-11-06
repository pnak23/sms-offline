import type { CardSubject, ReportCard } from '../types/api';

/** A made-up student for the preview in Settings → Report card (never stored, never printed, never a real child). `t` supplies the Khmer sample words. */
export function sampleReportCard(t: (key: string) => string, subjectCount = 5): ReportCard {
  const subjects: CardSubject[] = Array.from({ length: subjectCount }, (_, i) => ({
    examSubjectId: i + 1,
    subjectName: t(`reportCardTemplate.sample.subject${(i % 5) + 1}`),
    maxScore: 10,
    weight: 1,
    score: [9, 8.5, 7.75, 9.25, 8][i % 5] ?? 8,
    absent: false,
    // the first sample subject is made of two sub-subjects (4 + 6 = 10; 3.5 + 5.5 = 9), shown only when the card's sub-subject option is on
    subSubjects: i === 0
      ? [
          { subjectName: t('reportCardTemplate.sample.sub1'), maxScore: 4, score: 3.5, absent: false },
          { subjectName: t('reportCardTemplate.sample.sub2'), maxScore: 6, score: 5.5, absent: false },
        ]
      : [],
  }));
  const total = subjects.reduce((sum, s) => sum + (s.score ?? 0), 0);
  const totalMax = subjects.reduce((sum, s) => sum + s.maxScore, 0);
  return {
    examinationId: 0,
    examinationName: t('reportCardTemplate.sample.exam'),
    kind: 'MONTHLY',
    termNo: null,
    yearName: t('reportCardTemplate.sample.year'),
    classId: 0,
    className: t('reportCardTemplate.sample.class'),
    gradeName: t('reportCardTemplate.sample.grade'),
    enrollmentId: 0,
    studentId: 0,
    studentCode: '2026-0001',
    nameKm: t('reportCardTemplate.sample.student'),
    nameEn: 'Sample Student',
    gender: 'FEMALE',
    dateOfBirth: '2019-03-15',
    photoFile: null,
    subjects,
    total,
    totalMax,
    percent: Math.round((total / totalMax) * 10000) / 100,
    bandLetter: 'B',
    bandLabel: t('reportCardTemplate.sample.band'),
    passed: true,
    rank: 2,
    rankedCount: 38,
    complete: true,
    attendance: { basis: 'DAY', present: 19, late: 1, partial: 1, absent: 1, leave: 0, total: 22, from: '2026-11-01', to: '2026-11-30' },
    comment: t('reportCardTemplate.sample.comment'),
  };
}
