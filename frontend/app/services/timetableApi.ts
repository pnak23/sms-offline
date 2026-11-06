import type {
  TimetableClassView,
  TimetableCopyResult,
  TimetableLesson,
  TimetableSettings,
  TimetableSlot,
  TimetableStudentView,
  TimetableTeacherLoad,
  TimetableTeacherView,
} from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

/** The weekly timetable: Settings → Timetable (school days, time slots, copying a year) and the Timetable page. Days are 1 = Monday ... 7 = Sunday. */
export const timetableApi = {
  settings: (yearId: number) => http.get<TimetableSettings>(`/timetable/settings${queryString({ yearId })}`),

  setDays: (yearId: number, days: number[]) => http.put<TimetableSettings>('/timetable/days', { yearId, days }),

  createSlot: (yearId: number, nameKm: string, startTime: string, endTime: string, breakSlot: boolean) =>
    http.post<TimetableSlot>('/timetable/slots', { yearId, nameKm, startTime, endTime, breakSlot }),

  updateSlot: (id: number, nameKm: string, startTime: string, endTime: string, breakSlot: boolean, version: number) =>
    http.put<TimetableSlot>(`/timetable/slots/${id}`, { nameKm, startTime, endTime, breakSlot, version }),

  /** Only a slot that holds no lesson. */
  removeSlot: (id: number) => http.delete<void>(`/timetable/slots/${id}`),

  /** `preview: true` lists what would be copied and what would be skipped (with the reason) and changes nothing. */
  copyYear: (toYearId: number, fromYearId: number, preview: boolean) =>
    http.post<TimetableCopyResult>(`/timetable/years/${toYearId}/copy-from/${fromYearId}`, { preview }),

  classView: (classId: number) => http.get<TimetableClassView>(`/timetable/classes/${classId}`),

  /** Saves one cell. Both a subject and a teacher are required. */
  setCell: (classId: number, dayOfWeek: number, slotId: number, subjectId: number, teacherId: number) =>
    http.put<TimetableLesson>(`/timetable/classes/${classId}/cell`, { dayOfWeek, slotId, subjectId, teacherId }),

  clearCell: (classId: number, dayOfWeek: number, slotId: number) => http.delete<void>(`/timetable/classes/${classId}/cell${queryString({ dayOfWeek, slotId })}`),

  copyClass: (targetClassId: number, sourceClassId: number, replace: boolean, preview: boolean) =>
    http.post<TimetableCopyResult>(`/timetable/classes/${targetClassId}/copy-from/${sourceClassId}`, { replace, preview }),

  teacherView: (teacherId: number, yearId: number) => http.get<TimetableTeacherView>(`/timetable/teachers/${teacherId}${queryString({ yearId })}`),

  teacherLoads: (yearId: number) => http.get<TimetableTeacherLoad[]>(`/timetable/teacher-loads${queryString({ yearId })}`),

  /** The timetable of the student's class (default year: the current one). */
  studentView: (studentId: number, yearId?: number | null) => http.get<TimetableStudentView>(`/timetable/students/${studentId}${queryString({ yearId: yearId ?? undefined })}`),
};
