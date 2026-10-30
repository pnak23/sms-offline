import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { settingsApi } from '../services/settingsApi';
import type { AppSettings } from '../types/api';

export const DEFAULT_IDLE_LOCK_MINUTES = 10;
export const DEFAULT_BACKUP_REMINDER_DAYS = 7;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** GET/PUT /settings/app (key/value strings). Defaults apply until the settings were loaded after sign-in. */
export const usePreferencesStore = defineStore('preferences', () => {
  const values = ref<AppSettings>({});
  const loaded = ref(false);

  const idleLockMinutes = computed(() => positiveInt(values.value['ui.idleLockMinutes'], DEFAULT_IDLE_LOCK_MINUTES));
  const backupReminderDays = computed(() => positiveInt(values.value['backup.reminderDays'], DEFAULT_BACKUP_REMINDER_DAYS));

  async function load(): Promise<void> {
    values.value = await settingsApi.app();
    loaded.value = true;
  }

  async function save(changes: AppSettings): Promise<void> {
    values.value = await settingsApi.updateApp(changes);
    loaded.value = true;
  }

  function reset(): void {
    values.value = {};
    loaded.value = false;
  }

  return { values, loaded, idleLockMinutes, backupReminderDays, load, save, reset };
});
