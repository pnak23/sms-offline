import type { ReportTable, TimetableClassView, TimetableGrid, TimetableLesson, TimetableStudentView, TimetableTeacherView } from '../types/api';
import { CELL_SEPARATOR, slotLabel, sortedDays, visibleSlots } from './timetable';

// The printed / Excel form of a timetable: ONE table (rows = time slots, columns = school days), built the same way as every other report so that the preview, the A4
// page and the Excel file cannot disagree. Pure functions of data and a translator, unit-tested without a browser.
type Translate = (key: string, params?: Record<string, unknown>) => string;

const joinLine = (...parts: (string | null | undefined)[]): string => parts.filter((p): p is string => !!p && p.trim() !== '').join(' · ');

interface Heading {
  sheetName: string;
  title: string;
  subtitle: string;
}

/**
 * Rows are the slots the person uses (and the breaks between them); a break row repeats the break's name in every day cell, which the print page shows as one shaded
 * band and Excel shows as it is. `cell` turns a lesson into its one line of text (the print page breaks it into lines at CELL_SEPARATOR).
 */
export function timetableTable(t: Translate, heading: Heading, grid: TimetableGrid, cell: (lesson: TimetableLesson) => string): ReportTable {
  const days = sortedDays(grid.days);
  const rows = visibleSlots(grid.slots, grid.lessons, 'used').map((slot) => [
    slotLabel(slot),
    ...days.map((day) => {
      if (slot.breakSlot) return slot.nameKm;
      const lesson = grid.lessons.find((l) => l.dayOfWeek === day && l.slotId === slot.id);
      return lesson ? cell(lesson) : '';
    }),
  ]);
  return {
    sheetName: heading.sheetName,
    title: heading.title,
    subtitle: heading.subtitle,
    columns: [
      { label: t('timetable.time'), type: 'TEXT', width: 22 },
      ...days.map((day) => ({ label: t(`timetable.day.${day}`), type: 'TEXT' as const, width: 26 })),
    ],
    rows,
  };
}

/** A class's week: each cell is the subject and the teacher. */
export function classTimetableTable(t: Translate, view: TimetableClassView): ReportTable {
  return timetableTable(
    t,
    {
      sheetName: t('reports.timetableClass.sheet'),
      title: t('reports.timetableClass.title'),
      subtitle: joinLine(`${view.gradeName} ${view.className}`, view.yearName, t('timetable.lessonsInWeek', { n: view.grid.lessons.length })),
    },
    view.grid,
    (l) => `${l.subjectName}${CELL_SEPARATOR}${l.teacherName}`,
  );
}

/** A teacher's week across all classes: each cell is the subject and the class; the subtitle carries the weekly lesson count. */
export function teacherTimetableTable(t: Translate, view: TimetableTeacherView): ReportTable {
  return timetableTable(
    t,
    {
      sheetName: t('reports.timetableTeacher.sheet'),
      title: t('reports.timetableTeacher.title'),
      subtitle: joinLine(view.teacherName, view.yearName, t('timetable.teacherLessons', { n: view.lessonCount })),
    },
    view.grid,
    (l) => `${l.subjectName}${CELL_SEPARATOR}${l.gradeName} ${l.className}`,
  );
}

/** A student's week: the timetable of the student's class, with the student's name on it. */
export function studentTimetableTable(t: Translate, view: TimetableStudentView, studentName: string): ReportTable {
  return timetableTable(
    t,
    {
      sheetName: t('reports.timetableStudent.sheet'),
      title: t('reports.timetableStudent.title'),
      subtitle: joinLine(studentName, view.className ? `${view.gradeName ?? ''} ${view.className}`.trim() : t('timetable.notEnrolledShort'), view.yearName),
    },
    view.grid,
    (l) => `${l.subjectName}${CELL_SEPARATOR}${l.teacherName}`,
  );
}

/** A break row: every day cell is the break's own name, which is also the name part of the first cell. Used by the print page to draw one band. */
export function breakRowName(row: (string | number | null)[]): string | null {
  const first = String(row[0] ?? '');
  const name = first.split(CELL_SEPARATOR).slice(1).join(CELL_SEPARATOR);
  if (!name || row.length < 2) return null;
  return row.slice(1).every((c) => c === name) ? name : null;
}
