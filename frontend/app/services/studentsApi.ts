import type { StudentDetail, StudentFilters, StudentInput, StudentRow, StudentStatus } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

const params = (f: StudentFilters) => ({ ...f, unenrolled: f.unenrolled || undefined });
const body = (input: StudentInput) => ({ ...input, enrollmentDate: input.enrollmentDate || null });

export const studentsApi = {
  /** `q` searches name, English name, code, and a guardian's name or phone. The class shown is the one of `yearId` (default: the current year). */
  list: (filters: StudentFilters = {}) => http.get<StudentRow[]>(`/students${queryString(params(filters))}`),

  get: (id: number) => http.get<StudentDetail>(`/students/${id}`),

  /** `classId` enrols the new student in that class in the same step. */
  create: (input: StudentInput, classId: number | null) => http.post<StudentDetail>('/students', { ...body(input), classId }),

  update: (id: number, input: StudentInput, version: number) => http.put<StudentDetail>(`/students/${id}`, { ...body(input), version }),

  /** ACTIVE / INACTIVE / GRADUATED. Leaving or graduating ends the current enrollment. */
  setStatus: (id: number, status: StudentStatus, version: number, reason = '') =>
    http.put<StudentDetail>(`/students/${id}/status`, { status, version, reason }),

  /** Only a student without history (nothing ended, no records). */
  remove: (id: number) => http.delete<void>(`/students/${id}`),

  uploadPhoto: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.postForm<StudentDetail>(`/students/${id}/photo`, form);
  },

  removePhoto: (id: number) => http.delete<StudentDetail>(`/students/${id}/photo`),

  /** The photo is fetched with the token and shown through a blob URL (an <img src> cannot send it). */
  photoBlob: (fileName: string) => http.blob(`/files/students/${encodeURIComponent(fileName)}`),

  /** The same list as an .xlsx file. `labels` are the Khmer column titles and value names (the server has no user-facing text). */
  exportExcel: (filters: StudentFilters, labels: Record<string, string>) => http.postBlob('/students/export', { ...params(filters), labels }),
};
