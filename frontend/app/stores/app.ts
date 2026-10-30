import { defineStore } from 'pinia';
import { ref } from 'vue';
import { authApi } from '../services/authApi';
import { connectDesktop, DesktopUnavailableError } from '../services/desktop';
import { http } from '../services/http';
import type { AuthStatus } from '../types/api';
import { isApiError } from '../utils/apiError';
import { useSessionStore } from './session';

export type AppNotice = 'SESSION_EXPIRED' | 'SIGNED_OUT' | 'PASSWORD_CHANGED';

/** Application-level state: the connection to the backend, the latest /auth/status and one-shot notices. */
export const useAppStore = defineStore('app', () => {
  const status = ref<AuthStatus | null>(null);
  const connected = ref(false);
  const desktopVersion = ref('');
  /** Set while the backend cannot be reached; the full-screen overlay shows the code. */
  const backendDown = ref<{ code: string } | null>(null);
  /** A message for the next screen to show once (e.g. on the sign-in page after an expiry). */
  const notice = ref<AppNotice | null>(null);

  function markBackendDown(code: string): void {
    backendDown.value = { code };
  }

  function clearBackendDown(): void {
    backendDown.value = null;
  }

  function setNotice(value: AppNotice | null): void {
    notice.value = value;
  }

  /** Takes the pending notice (so it is shown once). */
  function takeNotice(): AppNotice | null {
    const current = notice.value;
    notice.value = null;
    return current;
  }

  /** Finds the backend through the desktop bridge. False when that fails (the overlay explains why). */
  async function connect(): Promise<boolean> {
    if (connected.value) return true;
    try {
      const connection = await connectDesktop();
      http.configure({ baseUrl: connection.info.backendBaseUrl, extraHeaders: connection.extraHeaders });
      desktopVersion.value = connection.info.version;
      connected.value = true;
      return true;
    } catch (error) {
      markBackendDown(error instanceof DesktopUnavailableError ? 'DESKTOP_BRIDGE_MISSING' : 'NETWORK_ERROR');
      return false;
    }
  }

  /** GET /auth/status. Null when the backend is unreachable. Detects a session that expired on the server. */
  async function refreshStatus(): Promise<AuthStatus | null> {
    try {
      const fresh = await authApi.status();
      status.value = fresh;
      clearBackendDown();
      const session = useSessionStore();
      if (session.isAuthenticated && !fresh.authenticated) {
        session.clear();
        notice.value = 'SESSION_EXPIRED';
      }
      return fresh;
    } catch (error) {
      if (isApiError(error) && error.isNetwork) markBackendDown('NETWORK_ERROR');
      else if (isApiError(error)) markBackendDown(error.code);
      return null;
    }
  }

  return {
    status,
    connected,
    desktopVersion,
    backendDown,
    notice,
    markBackendDown,
    clearBackendDown,
    setNotice,
    takeNotice,
    connect,
    refreshStatus,
  };
});
