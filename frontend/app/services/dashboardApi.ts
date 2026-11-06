import type { Dashboard, DashboardCharts, SchoolEvent, SchoolEventInput } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

export const dashboardApi = {
  /** The figures on the dashboard, counted now. `fees` is null while fees are switched off. */
  get: () => http.get<Dashboard>('/dashboard'),

  /** The data of the charts (read only), loaded apart from the figures so that those appear at once. */
  charts: () => http.get<DashboardCharts>('/dashboard/charts'),
};

export const schoolEventsApi = {
  /** Events that overlap `from`..`to` (both optional), earliest first. `from` = today is "upcoming". */
  list: (filters: { from?: string; to?: string; limit?: number } = {}) => http.get<SchoolEvent[]>(`/school-events${queryString({ ...filters })}`),

  create: (input: SchoolEventInput) => http.post<SchoolEvent>('/school-events', input),

  update: (id: number, input: SchoolEventInput, version: number) => http.put<SchoolEvent>(`/school-events/${id}`, { ...input, version }),

  remove: (id: number) => http.delete<void>(`/school-events/${id}`),
};
