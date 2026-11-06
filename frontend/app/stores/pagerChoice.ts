import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * How many items per page each paged list was last shown with ("5", "10", "20" or 0 = all), so a list opens the way it was left when you come back to it.
 * It lives in memory only (the program stores nothing in the browser: no localStorage, sessionStorage or cookies) and is gone when the program is closed.
 * It is a display preference, not data about anyone, so signing out does not clear it.
 */
export const usePagerChoiceStore = defineStore('pagerChoice', () => {
  const sizes = ref<Record<string, number>>({});

  const sizeFor = (key: string, fallback: number): number => sizes.value[key] ?? fallback;

  function remember(key: string, size: number): void {
    sizes.value = { ...sizes.value, [key]: size };
  }

  return { sizeFor, remember };
});
