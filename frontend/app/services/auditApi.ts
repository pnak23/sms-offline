import type { AuditFilters, AuditPage, AuditQuery } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

/** The audit trail, read only. */
export const auditApi = {
  list: (query: AuditQuery = {}) => http.get<AuditPage>(`/audit${queryString({ ...query })}`),

  /** What the filter drop-downs offer: only values that exist in the trail. */
  filters: () => http.get<AuditFilters>('/audit/filters'),
};
