import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '../services/authApi';
import type { UserDto } from '../types/api';

/**
 * The signed-in session. The Bearer token lives here, in memory, and nowhere else: not in localStorage,
 * sessionStorage, cookies or the URL. A reload therefore signs the user out, which is intended.
 */
export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(null);
  const user = ref<UserDto | null>(null);
  /** UI lock (idle or manual): the page underneath stays mounted, so unsaved form state survives. */
  const locked = ref(false);

  const isAuthenticated = computed(() => token.value !== null);

  /** Adopt a session issued by /auth/login or /auth/setup. */
  function begin(newToken: string, newUser: UserDto): void {
    token.value = newToken;
    user.value = newUser;
    locked.value = false;
  }

  /** Forget the session locally (sign-out, expiry, recovery). */
  function clear(): void {
    token.value = null;
    user.value = null;
    locked.value = false;
  }

  async function login(username: string, password: string): Promise<{ recoveryKeyPending: boolean }> {
    const response = await authApi.login({ username, password });
    if (!response.token) throw new Error('login response without a token');
    begin(response.token, response.user);
    return { recoveryKeyPending: response.recoveryKeyPending };
  }

  /** Always ends locally, even when the server cannot be reached. */
  async function logout(): Promise<void> {
    try {
      if (token.value) await authApi.logout();
    } catch {
      // the token dies with the server's memory anyway
    } finally {
      clear();
    }
  }

  function lock(): void {
    if (token.value) locked.value = true;
  }

  async function unlock(password: string): Promise<void> {
    await authApi.unlock(password);
    locked.value = false;
  }

  return { token, user, locked, isAuthenticated, begin, clear, login, logout, lock, unlock };
});
