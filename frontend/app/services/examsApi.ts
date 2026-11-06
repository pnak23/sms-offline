import type { ExamResults, ExamSubject, Examination, ExaminationInput, ScoreEntry, ScoreSheet, StudentExamResult } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

export const examsApi = {
  list: (yearId?: number | null) => http.get<Examination[]>(`/examinations${queryString({ yearId })}`),

  get: (id: number) => http.get<Examination>(`/examinations/${id}`),

  /** Starts with every subject each grade studies, at a maximum of 100 and weight 1. */
  create: (academicYearId: number, input: ExaminationInput) => http.post<Examination>('/examinations', { academicYearId, ...input }),

  update: (id: number, input: ExaminationInput, version: number) => http.put<Examination>(`/examinations/${id}`, { ...input, version }),

  /** Only an examination nobody has entered a score for. */
  remove: (id: number) => http.delete<void>(`/examinations/${id}`),

  subjects: (id: number) => http.get<ExamSubject[]>(`/examinations/${id}/subjects`),

  addSubject: (id: number, body: { gradeId: number; subjectId: number; maxScore: number; weight: number }) => http.post<ExamSubject>(`/examinations/${id}/subjects`, body),

  updateSubject: (id: number, subjectRowId: number, body: { maxScore: number; weight: number }) => http.put<ExamSubject>(`/examinations/${id}/subjects/${subjectRowId}`, body),

  removeSubject: (id: number, subjectRowId: number) => http.delete<void>(`/examinations/${id}/subjects/${subjectRowId}`),

  /** A sub-subject joins through its main subject, which must already be in the examination for that grade. Answers with the main subject's row. */
  addSubSubject: (id: number, body: { gradeId: number; subjectId: number; maxScore: number }) => http.post<ExamSubject>(`/examinations/${id}/sub-subjects`, body),

  updateSubSubject: (id: number, rowId: number, body: { maxScore: number }) => http.put<ExamSubject>(`/examinations/${id}/sub-subjects/${rowId}`, body),

  removeSubSubject: (id: number, rowId: number) => http.delete<void>(`/examinations/${id}/sub-subjects/${rowId}`),

  scoreSheet: (id: number, classId: number, subjectId: number) => http.get<ScoreSheet>(`/examinations/${id}/scores${queryString({ classId, subjectId })}`),

  /** Saves the scores of one subject for one class. A score changed later is a correction; the old one stays in the audit trail. */
  saveScores: (id: number, classId: number, subjectId: number, scores: ScoreEntry[]) => http.put<ScoreSheet>(`/examinations/${id}/scores`, { classId, subjectId, scores }),

  results: (id: number, classId: number) => http.get<ExamResults>(`/examinations/${id}/results${queryString({ classId })}`),

  /** One student's results in every examination of every year they were enrolled. */
  studentResults: (studentId: number) => http.get<StudentExamResult[]>(`/students/${studentId}/results`),
};
