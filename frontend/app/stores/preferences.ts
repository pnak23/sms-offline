import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { settingsApi } from '../services/settingsApi';
import type { AppSettings, AttendanceBasis, FeeCurrency } from '../types/api';
import { honorDefaultsFrom } from '../utils/honorRoll';
import { rankingDefaultsFrom } from '../utils/monthlyRanking';
import { cardOptionsFrom } from '../utils/reportCardOptions';

export const DEFAULT_IDLE_LOCK_MINUTES = 10;
/** The reminder to copy a backup to a USB stick is OFF (0) until the school asks for it: a copy on a USB stick is optional (the owner's policy of 2026-11-05). */
export const DEFAULT_BACKUP_REMINDER_DAYS = 0;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** GET/PUT /settings/app (key/value strings). Defaults apply until the settings were loaded after sign-in. */
export const usePreferencesStore = defineStore('preferences', () => {
  const values = ref<AppSettings>({});
  const loaded = ref(false);

  const idleLockMinutes = computed(() => positiveInt(values.value['ui.idleLockMinutes'], DEFAULT_IDLE_LOCK_MINUTES));
  const backupReminderDays = computed(() => nonNegativeInt(values.value['backup.reminderDays'], DEFAULT_BACKUP_REMINDER_DAYS));

  // Printed reports: Khmer digits on paper, and the national / ministry header above the school's name (both off by default).
  const khmerNumerals = computed(() => values.value['report.khmerNumerals'] === 'true');
  const moeysHeader = computed(() => values.value['report.moeysHeader'] === 'true');
  const headerLines = computed(() => ['report.headerLine1', 'report.headerLine2', 'report.headerLine3'].map((k) => (values.value[k] ?? '').trim()).filter((line) => line !== ''));

  // How attendance is counted officially (the dashboard and the report cards): DAY until the school chooses SESSION. The screens always offer both.
  const attendanceBasis = computed<AttendanceBasis>(() => (values.value['attendance.officialBasis'] === 'SESSION' ? 'SESSION' : 'DAY'));

  // The report card's layout (Settings → Report card); the defaults are the card as it always was.
  const cardOptions = computed(() => cardOptionsFrom(values.value));

  // The roll of honour's one saved default (Settings → Roll of honour): what its options window starts with.
  const honorDefaults = computed(() => honorDefaultsFrom(values.value));

  // The monthly ranking list's one saved default (its texts, their look, the column headings): what its page starts with.
  const rankingDefaults = computed(() => rankingDefaultsFrom(values.value));

  // Fees are optional (off by default); the currencies a fee may be in (KHR only until the school says otherwise). When both are allowed the preferred one
  // (fees.defaultCurrency, KHR until chosen) comes first: it is what a new fee category starts in and what lists and reports show first. It changes no stored money.
  const feesEnabled = computed(() => values.value['fees.enabled'] === 'true');
  const feeDefaultCurrency = computed<FeeCurrency>(() => (values.value['fees.defaultCurrency'] === 'USD' ? 'USD' : 'KHR'));
  const feeCurrencies = computed<FeeCurrency[]>(() => {
    const listed = (values.value['fees.currencies'] ?? 'KHR').split(',').filter((c): c is FeeCurrency => c === 'KHR' || c === 'USD');
    if (listed.length === 0) return ['KHR'];
    return listed.length > 1 && listed.includes(feeDefaultCurrency.value) ? [feeDefaultCurrency.value, ...listed.filter((c) => c !== feeDefaultCurrency.value)] : listed;
  });

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

  return { values, loaded, idleLockMinutes, backupReminderDays, khmerNumerals, moeysHeader, headerLines, attendanceBasis, cardOptions, honorDefaults, rankingDefaults, feesEnabled, feeCurrencies, feeDefaultCurrency, load, save, reset };
});
