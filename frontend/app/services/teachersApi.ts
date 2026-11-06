import type { Teacher, TeacherClasses, TeacherInput } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

/** The form's text as the server wants it: an empty date is "no date". */
const body = (input: TeacherInput) => ({ ...input, employmentDate: input.employmentDate || null });

export const teachersApi = {
  /** `q` searches name, code, phone and specialisation; `status` is ACTIVE or INACTIVE (empty = both). */
  list: (filters: { q?: string; status?: string } = {}) => http.get<Teacher[]>(`/teachers${queryString(filters)}`),

  get: (id: number) => http.get<Teacher>(`/teachers/${id}`),

  /** The classes this teacher is homeroom teacher of, and the subjects taught in each class. */
  classes: (id: number) => http.get<TeacherClasses>(`/teachers/${id}/classes`),

  create: (input: TeacherInput) => http.post<Teacher>('/teachers', body(input)),

  update: (id: number, input: TeacherInput, version: number) => http.put<Teacher>(`/teachers/${id}`, { ...body(input), version }),

  setActive: (id: number, active: boolean, version: number) => http.put<Teacher>(`/teachers/${id}/active`, { active, version }),
};
