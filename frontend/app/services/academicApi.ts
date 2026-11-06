import type { AcademicYear, AcademicYearInput, AcademicYearUpdateInput, Grade, Subject, SubjectInput } from '../types/api';
import { http } from './http';

export const academicApi = {
  grades: () => http.get<Grade[]>('/grades'),

  /** Replaces the set of subjects a grade studies. */
  setGradeSubjects: (gradeId: number, subjectIds: number[]) => http.put<Grade>(`/grades/${gradeId}/subjects`, { subjectIds }),

  years: () => http.get<AcademicYear[]>('/academic-years'),

  createYear: (body: AcademicYearInput) => http.post<AcademicYear>('/academic-years', body),

  updateYear: (id: number, body: AcademicYearUpdateInput) => http.put<AcademicYear>(`/academic-years/${id}`, body),

  setCurrentYear: (id: number) => http.post<AcademicYear>(`/academic-years/${id}/set-current`),

  closeYear: (id: number) => http.post<AcademicYear>(`/academic-years/${id}/close`),

  reopenYear: (id: number) => http.post<AcademicYear>(`/academic-years/${id}/reopen`),

  subjects: () => http.get<Subject[]>('/subjects'),

  createSubject: (body: SubjectInput) => http.post<Subject>('/subjects', body),

  updateSubject: (id: number, body: SubjectInput, version: number) => http.put<Subject>(`/subjects/${id}`, { ...body, version }),

  /** Only a subject nothing uses, and not one that still has sub-subjects. */
  removeSubject: (id: number) => http.delete<void>(`/subjects/${id}`),

  setSubjectActive: (id: number, active: boolean, version: number) =>
    http.put<Subject>(`/subjects/${id}/active`, { active, version }),
};
