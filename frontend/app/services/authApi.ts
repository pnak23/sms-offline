import type { AuthStatus, KeyResponse, RecoverResponse, SessionResponse, SetupResponse } from '../types/api';
import { http } from './http';

export const authApi = {
  status: () => http.get<AuthStatus>('/auth/status'),

  setup: (body: { displayName: string; username: string; password: string }) =>
    http.post<SetupResponse>('/auth/setup', body),

  login: (body: { username: string; password: string }) => http.post<SessionResponse>('/auth/login', body),

  logout: () => http.post<void>('/auth/logout'),

  unlock: (password: string) => http.post<void>('/auth/unlock', { password }),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    http.post<void>('/auth/change-password', body),

  recover: (body: { recoveryKey: string; newPassword: string }) => http.post<RecoverResponse>('/auth/recover', body),

  confirmRecoveryKey: () => http.post<void>('/auth/recovery-key/confirm'),

  regenerateRecoveryKey: (currentPassword: string) =>
    http.post<KeyResponse>('/auth/recovery-key/regenerate', { currentPassword }),
};
