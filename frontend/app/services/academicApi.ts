import type { AcademicYear, AcademicYearInput, Grade, Subject } from '../types/api';
import { http } from './http';

export const academicApi = {
  grades: () => http.get<Grade[]>('/grades'),

  years: () => http.get<AcademicYear[]>('/academic-years'),

  createYear: (body: AcademicYearInput) => http.post<AcademicYear>('/academic-years', body),

  subjects: () => http.get<Subject[]>('/subjects'),

  setSubjectActive: (id: number, active: boolean, version: number) =>
    http.put<Subject>(`/subjects/${id}/active`, { active, version }),
};
