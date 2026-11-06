import type { AttendancePeriod } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

/** The sessions of the school day, per academic year (Settings → Attendance sessions). */
export const attendancePeriodsApi = {
  list: (academicYearId: number) => http.get<AttendancePeriod[]>(`/attendance-periods${queryString({ academicYearId })}`),

  create: (academicYearId: number, nameKm: string, startTime: string | null, endTime: string | null) =>
    http.post<AttendancePeriod>('/attendance-periods', { academicYearId, nameKm, startTime, endTime }),

  update: (id: number, nameKm: string, startTime: string | null, endTime: string | null, version: number) =>
    http.put<AttendancePeriod>(`/attendance-periods/${id}`, { nameKm, startTime, endTime, version }),

  setEnabled: (id: number, enabled: boolean, version: number) => http.put<AttendancePeriod>(`/attendance-periods/${id}/enabled`, { enabled, version }),

  /** The administrator says these are the school's real name and times, not an example. Any later edit takes it back. */
  confirm: (id: number) => http.post<AttendancePeriod>(`/attendance-periods/${id}/confirm`),

  /** `ids` is the whole year's sessions in the new order. */
  reorder: (academicYearId: number, ids: number[]) => http.put<AttendancePeriod[]>('/attendance-periods/order', { academicYearId, ids }),

  /** Takes over the other year's sessions whose name is not already there; they start unconfirmed. */
  copy: (fromYearId: number, toYearId: number) => http.post<AttendancePeriod[]>('/attendance-periods/copy', { fromYearId, toYearId }),

  /** Only a session no sheet has used. */
  remove: (id: number) => http.delete<void>(`/attendance-periods/${id}`),
};
