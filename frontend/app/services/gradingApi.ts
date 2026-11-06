import type { GradingScale, GradingScaleInput } from '../types/api';
import { http } from './http';

export const gradingApi = {
  list: () => http.get<GradingScale[]>('/grading-scales'),

  create: (input: GradingScaleInput) => http.post<GradingScale>('/grading-scales', input),

  update: (id: number, input: GradingScaleInput, version: number) => http.put<GradingScale>(`/grading-scales/${id}`, { ...input, version }),

  /** The default scale is the one new report cards and results use. */
  setDefault: (id: number) => http.post<GradingScale>(`/grading-scales/${id}/set-default`),
};
