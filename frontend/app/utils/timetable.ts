import type { TimetableLesson, TimetableSlot } from '../types/api';

// Pure helpers of the weekly timetable grid. Days are 1 = Monday ... 7 = Sunday (the backend's numbers). Nothing here knows a school's real times, days or
// slots: they all come from the school's own settings.

/** The seven days, in order (the settings page offers all of them; a year uses the ones the school ticked). */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** The lines of a printed or Excel cell (the subject, then the teacher or the class) are joined with this; the print page splits them again. */
export const CELL_SEPARATOR = ' · ';

/** The lesson in one cell, or null. */
export function lessonAt(lessons: TimetableLesson[], day: number, slotId: number): TimetableLesson | null {
  return lessons.find((l) => l.dayOfWeek === day && l.slotId === slotId) ?? null;
}

/**
 * The rows a timetable shows. `all`: every slot (what an editor needs, so that an empty cell can be clicked). `used`: only the slots that hold a lesson, plus the breaks
 * that fall between the first and the last of them, so a class that never meets in a later slot has no empty row and a printed page is not padded. With no lesson at all,
 * `used` is empty. Slots are expected in time order, as the backend sends them.
 */
export function visibleSlots(slots: TimetableSlot[], lessons: TimetableLesson[], mode: 'all' | 'used'): TimetableSlot[] {
  if (mode === 'all') return slots;
  const used = new Set(lessons.map((l) => l.slotId));
  const indexes = slots.map((s, i) => (used.has(s.id) ? i : -1)).filter((i) => i >= 0);
  if (indexes.length === 0) return [];
  const first = indexes[0] as number;
  const last = indexes[indexes.length - 1] as number;
  return slots.filter((s, i) => i >= first && i <= last && (used.has(s.id) || s.breakSlot));
}

/** A teacher's lessons in the week. */
export function lessonsOfTeacher(lessons: TimetableLesson[], teacherId: number): number {
  return lessons.filter((l) => l.teacherId === teacherId).length;
}

/** "07:00–07:45" (an en dash, no spaces). */
export function slotTimes(slot: Pick<TimetableSlot, 'startTime' | 'endTime'>): string {
  return `${slot.startTime}–${slot.endTime}`;
}

/** The label of a grid row: the times and the school's name for the slot. */
export function slotLabel(slot: TimetableSlot): string {
  return `${slotTimes(slot)}${CELL_SEPARATOR}${slot.nameKm}`;
}

/** The ids of the days the grid shows as columns: the school's days, in week order. */
export function sortedDays(days: number[]): number[] {
  return [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
}
