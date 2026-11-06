import type { AttendanceDay, AttendanceEntry, AttendanceSession, AttendanceSheet, AttendanceSummaryRow, StudentAttendance } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

export const attendanceApi = {
  /** The class list for one day and session with whatever was recorded; reading it creates nothing. Without a session: the year's first enabled one. */
  sheet: (classId: number, date: string, periodId?: number | null) => http.get<AttendanceSheet>(`/attendance/sheet${queryString({ classId, date, periodId: periodId ?? undefined })}`),

  /** Records the day's session. Saving it again corrects it in place (the old status stays in the audit trail). */
  save: (classId: number, date: string, periodId: number | null, note: string | null, records: AttendanceEntry[]) =>
    http.put<AttendanceSheet>('/attendance/sheet', { classId, date, periodId, note, records }),

  sessions: (classId: number, from: string, to: string) => http.get<AttendanceSession[]>(`/attendance/sessions${queryString({ classId, from, to })}`),

  /** One row per date of the class: the students in each day status and the sheets taken that day. */
  days: (classId: number, from: string, to: string) => http.get<AttendanceDay[]>(`/attendance/days${queryString({ classId, from, to })}`),

  summary: (classId: number, from: string, to: string) => http.get<AttendanceSummaryRow[]>(`/attendance/summary${queryString({ classId, from, to })}`),

  forStudent: (studentId: number, from: string, to: string) => http.get<StudentAttendance>(`/students/${studentId}/attendance${queryString({ from, to })}`),
};
