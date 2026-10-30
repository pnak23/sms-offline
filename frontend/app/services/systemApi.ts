import type { HealthReport, SystemInfo } from '../types/api';
import { http } from './http';

export const systemApi = {
  /** Quick checks; also works before any account exists (wizard step 1). */
  health: () => http.get<HealthReport>('/system/health'),

  /** Adds the full integrity and uploads checks; takes longer. */
  deepHealth: () => http.post<HealthReport>('/system/health/deep'),

  info: () => http.get<SystemInfo>('/system/info'),
};
