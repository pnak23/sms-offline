import type { EnrollmentResult, PromotionDecision, PromotionSummary } from '../types/api';
import { http } from './http';

export const enrollmentsApi = {
  enroll: (studentId: number, classId: number, enrolledOn: string | null = null) =>
    http.post<EnrollmentResult>('/enrollments', { studentId, classId, enrolledOn: enrolledOn || null }),

  /** To another class of the SAME year: the old row is closed as CHANGED_CLASS and a new one opened. */
  transfer: (enrollmentId: number, classId: number, date: string | null = null, reason = '') =>
    http.post<EnrollmentResult>(`/enrollments/${enrollmentId}/transfer`, { classId, date: date || null, reason }),

  /** The student leaves the school: the enrollment ends as LEFT and the student becomes inactive. */
  leave: (enrollmentId: number, date: string | null = null, reason = '') =>
    http.post<void>(`/enrollments/${enrollmentId}/leave`, { date: date || null, reason }),

  /** `dryRun` = a preview that writes nothing. The server checks everything first, so a request applies completely or not at all. */
  promote: (fromYearId: number, toYearId: number, decisions: PromotionDecision[], dryRun: boolean) =>
    http.post<PromotionSummary>(`/enrollments/promote?dryRun=${dryRun}`, { fromYearId, toYearId, decisions }),
};
