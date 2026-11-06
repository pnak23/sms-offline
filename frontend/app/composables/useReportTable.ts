import { academicApi } from '~/services/academicApi';
import { attendanceApi } from '~/services/attendanceApi';
import { classesApi } from '~/services/classesApi';
import { examsApi } from '~/services/examsApi';
import { feesApi } from '~/services/feesApi';
import { homeworkApi } from '~/services/homeworkApi';
import { studentsApi } from '~/services/studentsApi';
import { teachersApi } from '~/services/teachersApi';
import { timetableApi } from '~/services/timetableApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { AttendanceBasis, ReportTable, Subject } from '~/types/api';
import { recordedDays } from '~/utils/attendance';
import { formatDateKm } from '~/utils/date';
import { classTimetableTable, studentTimetableTable, teacherTimetableTable } from '~/utils/timetableTables';
import { attendanceTable, classRosterTable, feesTable, homeworkListTable, homeworkMarksTable, homeworkSummaryTable, resultsTable, studentListTable, teachersTable } from '~/utils/reportTables';

export const REPORT_NAMES = ['students', 'roster', 'attendance', 'results', 'teachers', 'fees', 'homework', 'homeworkMarks', 'homeworkSummary', 'timetableClass', 'timetableTeacher', 'timetableStudent'] as const;
export type ReportName = (typeof REPORT_NAMES)[number];

export interface ReportParams {
  yearId?: number | null;
  classId?: number | null;
  examId?: number | null;
  from?: string;
  to?: string;
  /** Attendance: count by DAY or by SESSION; the school's official method when left out. */
  basis?: AttendanceBasis;
  /** Students: ACTIVE / INACTIVE / GRADUATED; teachers: ACTIVE / INACTIVE; empty = all. */
  status?: string;
  order?: 'rank' | 'name';
  /** The homework reports: one assignment (homeworkMarks), or a subject to limit the list and the summary to (a main subject includes its sub-subjects). */
  homeworkId?: number | null;
  subjectId?: number | null;
  /** The timetable of one teacher (with yearId) or of one student's class (yearId optional: the current year). */
  teacherId?: number | null;
  studentId?: number | null;
}

/** Loads whatever one report needs from the server and builds its table (see utils/reportTables.ts). Errors are thrown for the page to show. */
export function useReportTable() {
  const { t } = useI18n();
  const preferences = usePreferencesStore();

  async function classLabel(classId: number): Promise<{ className: string; yearName: string }> {
    const { schoolClass } = await classesApi.get(classId);
    return { className: `${schoolClass.gradeName} ${schoolClass.nameKm}`, yearName: schoolClass.yearName };
  }

  /** "Subject: main › sub" for the subtitle of a report limited to one subject; null when it is about all of them. */
  function subjectText(subjects: Subject[], subjectId: number | null | undefined): string | null {
    if (!subjectId) return null;
    const sub = subjects.find((s) => s.id === subjectId);
    if (!sub) return null;
    const main = sub.parentId === null ? null : subjects.find((s) => s.id === sub.parentId);
    return `${t('exams.subject')}: ${main ? `${main.nameKm} › ${sub.nameKm}` : sub.nameKm}`;
  }

  async function build(name: ReportName, p: ReportParams): Promise<ReportTable> {
    const need = (value: number | null | undefined): number => {
      if (value === null || value === undefined) throw new Error(`report ${name}: a required choice is missing`);
      return value;
    };
    switch (name) {
      case 'students': {
        const parts: string[] = [];
        if (p.classId) {
          const c = await classLabel(p.classId);
          parts.push(c.className, c.yearName);
        } else if (p.yearId) {
          const year = (await academicApi.years()).find((y) => y.id === p.yearId);
          if (year) parts.push(year.nameKm);
        }
        if (p.status) parts.push(t(`studentStatus.${p.status}`));
        const rows = await studentsApi.list({ yearId: p.yearId ?? null, classId: p.classId ?? null, status: p.status || undefined });
        return studentListTable(t, rows, parts.join(' · '));
      }
      case 'roster': {
        const classId = need(p.classId);
        const [c, roster] = await Promise.all([classLabel(classId), classesApi.students(classId)]);
        return classRosterTable(t, roster, c.className, c.yearName);
      }
      case 'attendance': {
        const classId = need(p.classId);
        const from = p.from ?? '';
        const to = p.to ?? '';
        const [c, rows, sessions] = await Promise.all([classLabel(classId), attendanceApi.summary(classId, from, to), attendanceApi.sessions(classId, from, to)]);
        const basis = p.basis ?? preferences.attendanceBasis;
        return attendanceTable(t, rows, `${c.className} · ${c.yearName}`, `${formatDateKm(from)} → ${formatDateKm(to)}`, basis === 'DAY' ? recordedDays(sessions) : sessions.length, basis);
      }
      case 'results': {
        const classId = need(p.classId);
        const examId = need(p.examId);
        const [c, exam, results] = await Promise.all([classLabel(classId), examsApi.get(examId), examsApi.results(examId, classId)]);
        return resultsTable(t, results, { examName: exam.nameKm, className: `${c.className} · ${c.yearName}` }, p.order ?? 'rank');
      }
      case 'teachers': {
        const rows = await teachersApi.list({ status: p.status || undefined });
        return teachersTable(t, rows, p.status ? t(`teacherStatus.${p.status}`) : '');
      }
      case 'fees': {
        const classId = need(p.classId);
        const [c, summary] = await Promise.all([classLabel(classId), feesApi.classSummary(classId)]);
        return feesTable(t, summary, `${c.className} · ${c.yearName}`, preferences.feeCurrencies);
      }
      case 'homework': {
        const classId = need(p.classId);
        const from = p.from ?? '';
        const to = p.to ?? '';
        const [c, items, subjects] = await Promise.all([classLabel(classId), homeworkApi.list({ classId, from, to, subjectId: p.subjectId ?? null }), academicApi.subjects()]);
        return homeworkListTable(t, items, `${c.className} · ${c.yearName}`, `${formatDateKm(from)} → ${formatDateKm(to)}`, subjectText(subjects, p.subjectId));
      }
      case 'homeworkMarks': {
        const classId = need(p.classId);
        const homeworkId = need(p.homeworkId);
        const [c, sheet] = await Promise.all([classLabel(classId), homeworkApi.records(homeworkId)]);
        return homeworkMarksTable(t, sheet, `${c.className} · ${c.yearName}`);
      }
      case 'homeworkSummary': {
        const classId = need(p.classId);
        const from = p.from ?? '';
        const to = p.to ?? '';
        const [c, rows, subjects] = await Promise.all([classLabel(classId), homeworkApi.summary(classId, { from, to, subjectId: p.subjectId ?? null }), academicApi.subjects()]);
        return homeworkSummaryTable(t, rows, `${c.className} · ${c.yearName}`, `${formatDateKm(from)} → ${formatDateKm(to)}`, subjectText(subjects, p.subjectId));
      }
      case 'timetableClass':
        return classTimetableTable(t, await timetableApi.classView(need(p.classId)));
      case 'timetableTeacher':
        return teacherTimetableTable(t, await timetableApi.teacherView(need(p.teacherId), need(p.yearId)));
      case 'timetableStudent': {
        const studentId = need(p.studentId);
        const [view, detail] = await Promise.all([timetableApi.studentView(studentId, p.yearId ?? null), studentsApi.get(studentId)]);
        return studentTimetableTable(t, view, detail.student.nameKm);
      }
    }
  }

  return { build };
}
