import type { ReportCard } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

export const reportCardsApi = {
  /** The cards of a class for one examination, or only one student's card with `studentId`. */
  data: (examinationId: number, classId: number, studentId?: number | null) => http.get<ReportCard[]>(`/report-cards/data${queryString({ examinationId, classId, studentId })}`),

  /** The teacher's comment on one card; an empty text removes it. */
  saveComment: (examinationId: number, enrollmentId: number, comment: string) => http.put<void>('/report-cards/comment', { examinationId, enrollmentId, comment }),
};
