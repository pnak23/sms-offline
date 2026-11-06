import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { acceptanceApi } from '../services/acceptanceApi';
import type { AcceptanceItem } from '../types/api';
import { isSignedOff, summarize } from '../utils/acceptance';

/** What is pending for the school and what the administrator signed off. Loaded after sign-in; the screens that rely on placeholders read it. */
export const useAcceptanceStore = defineStore('acceptance', () => {
  const items = ref<AcceptanceItem[]>([]);
  const loaded = ref(false);
  const summary = computed(() => summarize(items.value));

  async function load(): Promise<void> {
    items.value = await acceptanceApi.list();
    loaded.value = true;
  }

  /** Not loaded yet counts as "not signed off": a placeholder is never presented as official because a request is slow. */
  const signed = (id: string): boolean => isSignedOff(items.value, id);

  function reset(): void {
    items.value = [];
    loaded.value = false;
  }

  return { items, loaded, summary, load, signed, reset };
});
