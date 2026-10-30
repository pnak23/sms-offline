import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { formatRecoveryKey } from '../utils/recoveryKey';

/**
 * A freshly issued recovery key, held in memory only until the user confirms they saved it. The print page reads the
 * key from here (never from the URL). Nothing is logged or persisted; `clear()` wipes it.
 */
export const useRecoveryKeyStore = defineStore('recoveryKey', () => {
  const key = ref<string | null>(null);
  const issuedAt = ref<string | null>(null);
  /** Route to return to after printing. */
  const returnTo = ref<string>('/dashboard');

  const hasKey = computed(() => key.value !== null);

  function issue(newKey: string, returnPath?: string): void {
    key.value = formatRecoveryKey(newKey);
    issuedAt.value = new Date().toISOString();
    if (returnPath) returnTo.value = returnPath;
  }

  function setReturnTo(path: string): void {
    returnTo.value = path;
  }

  function clear(): void {
    key.value = null;
    issuedAt.value = null;
    returnTo.value = '/dashboard';
  }

  return { key, issuedAt, returnTo, hasKey, issue, setReturnTo, clear };
});
