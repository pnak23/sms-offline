import type { AttendanceBasis, AttendanceSession, AttendanceStatus, DayStatusCode, DayTotals } from '../types/api';

/** How many different days have at least one sheet: a day taken in two sessions is still one day. */
export function recordedDays(sessions: AttendanceSession[]): number {
  return new Set(sessions.map((s) => s.date)).size;
}

/** "07:00–11:00", or '' when the session has no times (the times are information only: nothing is ever refused because of them). */
export function timeRange(start: string | null, end: string | null): string {
  return start && end ? `${start}–${end}` : '';
}

/** A session's name with its times when it has them: "ពេលព្រឹក (07:00–11:00)". */
export function periodLabel(nameKm: string, start: string | null, end: string | null): string {
  const range = timeRange(start, end);
  return range ? `${nameKm} (${range})` : nameKm;
}

/** "07:30" as typed or stored: two digits, a colon, two digits; the hour below 24. */
export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ---- days and sessions ---------------------------------------------------------------------------------------------------------------

export const ATTENDANCE_BASES: readonly AttendanceBasis[] = ['DAY', 'SESSION'];

/** The status columns of a table for a basis, in the order shown: by day there is a Partial column too, and the order is the owner's (present, late, partial, absent, leave). */
export function statusColumns(basis: AttendanceBasis): readonly (AttendanceStatus | DayStatusCode)[] {
  return basis === 'DAY' ? ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'LEAVE'] : ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];
}

interface SessionCounts {
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  days: DayTotals;
}

/** One summary row's figures for a basis, in the order of `statusColumns` followed by the total (days recorded, or sessions recorded). */
export function countsOf(row: SessionCounts, basis: AttendanceBasis): number[] {
  const d = row.days;
  return basis === 'DAY' ? [d.present, d.late, d.partial, d.absent, d.leave, d.total] : [row.present, row.absent, row.late, row.leave, row.total];
}

type Translate = (key: string, values?: Record<string, unknown>) => string;

/**
 * The column labels for a basis, each saying its unit (ថ្ងៃ for days, វគ្គ for sessions): a printed page or an Excel file has no other place to
 * say what is being counted. The last label is the total.
 */
export function columnLabels(t: Translate, basis: AttendanceBasis): string[] {
  const unit = t(`attendance.unit.${basis}`);
  return [...statusColumns(basis).map((code) => `${t(`attendance.status.${code}`)} (${unit})`), t(basis === 'DAY' ? 'attendance.totalDays' : 'attendance.totalSessions')];
}

/** The same counts for the dashboard's tile and a report card, whichever way the school counts. Partial is 0 for sessions. */
export interface BasisCounts {
  present: number;
  late: number;
  partial: number;
  absent: number;
  leave: number;
}

export function isBasis(value: unknown): value is AttendanceBasis {
  return value === 'DAY' || value === 'SESSION';
}
