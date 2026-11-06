import type { Homework, HomeworkFilters, HomeworkHistoryRow, HomeworkInput, HomeworkRecordInput, HomeworkRecordSheet, HomeworkStatus, HomeworkSummaryRow } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

export const homeworkApi = {
  /** Soonest due first; `from` / `to` limit the due date; `subjectId` is a subject (a main subject also matches its sub-subjects). */
  list: (filters: HomeworkFilters = {}) => http.get<Homework[]>(`/homework${queryString({ ...filters })}`),

  get: (id: number) => http.get<Homework>(`/homework/${id}`),

  create: (input: HomeworkInput) => http.post<Homework>('/homework', input),

  update: (id: number, input: HomeworkInput, version: number) => http.put<Homework>(`/homework/${id}`, { ...input, version }),

  setStatus: (id: number, status: HomeworkStatus, version: number) => http.put<Homework>(`/homework/${id}/status`, { status, version }),

  /** The students of the class with their record of this assignment (a student without one has no status, no mark, no remark). */
  records: (id: number) => http.get<HomeworkRecordSheet>(`/homework/${id}/records`),

  /** Saves the records; an entry with no status, no mark and no remark clears that student's record. Answers with the new sheet. */
  saveRecords: (id: number, records: HomeworkRecordInput[]) => http.put<HomeworkRecordSheet>(`/homework/${id}/records`, { records }),

  /** Every assignment of the classes a student was in, newest first, with their own record or none. */
  historyOf: (studentId: number) => http.get<HomeworkHistoryRow[]>(`/homework/by-student/${studentId}`),

  /** Per student of a class over the assignments due in a period (cancelled ones left out), optionally about one subject. */
  summary: (classId: number, filters: { from?: string; to?: string; subjectId?: number | null } = {}) => http.get<HomeworkSummaryRow[]>(`/homework/summary${queryString({ classId, ...filters })}`),
};
