import type { SetupProgress } from '../types/api';
import { http } from './http';

export const setupApi = {
  progress: () => http.get<SetupProgress>('/setup/progress'),
  saveProgress: (step: number) => http.put<SetupProgress>('/setup/progress', { step }),
  complete: () => http.post<SetupProgress>('/setup/complete'),
};
