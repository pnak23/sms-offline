import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * State of the "forgot password" flow, kept here (not in the page) because showing the new key's print page leaves
 * and re-enters the page. Memory only. The new password is held just long enough to sign in after the key is confirmed.
 */
export const useRecoveryStore = defineStore('recovery', () => {
  const phase = ref<'form' | 'key'>('form');
  const username = ref('');
  const displayName = ref('');
  const newPassword = ref('');

  function begin(result: { username: string; displayName: string }, password: string): void {
    username.value = result.username;
    displayName.value = result.displayName;
    newPassword.value = password;
    phase.value = 'key';
  }

  /** Wipes everything, including the password. */
  function reset(): void {
    phase.value = 'form';
    username.value = '';
    displayName.value = '';
    newPassword.value = '';
  }

  return { phase, username, displayName, newPassword, begin, reset };
});
