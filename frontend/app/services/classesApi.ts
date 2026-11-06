import type { ClassDetail, ClassDto, ClassInput, RosterRow } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

export const classesApi = {
  list: (filters: { yearId?: number | null; gradeId?: number | null } = {}) => http.get<ClassDto[]>(`/classes${queryString(filters)}`),

  get: (id: number) => http.get<ClassDetail>(`/classes/${id}`),

  create: (input: ClassInput) => http.post<ClassDetail>('/classes', input),

  /** The year and grade of a class never change; only these fields do. */
  update: (id: number, input: { nameKm: string; capacity: number | null; homeroomTeacherId: number | null }, version: number) =>
    http.put<ClassDetail>(`/classes/${id}`, { ...input, version }),

  /** Only a class nobody was ever enrolled in. */
  remove: (id: number) => http.delete<void>(`/classes/${id}`),

  /** Replaces the subject teachers of the class. */
  setTeachers: (id: number, assignments: { subjectId: number; teacherId: number }[]) =>
    http.put<ClassDetail>(`/classes/${id}/teachers`, { assignments }),

  /** The students in the class now; `includeEnded` adds everyone who was ever enrolled in it. */
  students: (id: number, includeEnded = false) =>
    http.get<RosterRow[]>(`/classes/${id}/students${queryString({ includeEnded: includeEnded || undefined })}`),
};
