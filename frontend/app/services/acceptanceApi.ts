import type { AcceptanceItem } from '../types/api';
import { http } from './http';

/** The readiness list and the administrator's sign-off of each item (Settings > About). */
export const acceptanceApi = {
  list: () => http.get<AcceptanceItem[]>('/acceptance'),

  /** The administrator says they checked this item for the school. The program itself can never do this. */
  signOff: (id: string, note: string | null) => http.post<AcceptanceItem>(`/acceptance/${id}/sign-off`, { note }),

  /** Takes a sign-off back; audited. */
  withdraw: (id: string) => http.delete<void>(`/acceptance/${id}/sign-off`),
};
