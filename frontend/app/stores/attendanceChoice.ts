import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * The last session of the school day each academic year was used with, so the attendance screen opens on it next time.
 * It lives in memory only (the program stores nothing in the browser: no localStorage, sessionStorage or cookies); it is cleared on sign-out
 * and by a reload, like the session itself.
 */
export const useAttendanceChoiceStore = defineStore('attendanceChoice', () => {
  const lastPeriodByYear = ref<Record<number, number>>({});

  const last = (yearId: number | null | undefined): number | null => (yearId == null ? null : (lastPeriodByYear.value[yearId] ?? null));

  function remember(yearId: number | null | undefined, periodId: number): void {
    if (yearId != null) lastPeriodByYear.value = { ...lastPeriodByYear.value, [yearId]: periodId };
  }

  function reset(): void {
    lastPeriodByYear.value = {};
  }

  return { last, remember, reset };
});
