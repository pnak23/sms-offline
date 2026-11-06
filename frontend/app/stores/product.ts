import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { systemApi } from '../services/systemApi';
import type { ProductInfo } from '../types/api';

/**
 * Who the program is (name, version, developer, channel, copyright), asked from the local backend: the web page carries no copy of it,
 * so it cannot disagree with the installer. Works before sign-in (the sign-in screen shows it) and never needs the internet.
 */
export const useProductStore = defineStore('product', () => {
  const info = ref<ProductInfo | null>(null);
  const shortLabel = computed(() => (info.value ? `${info.value.shortName} v${info.value.version}` : ''));

  /** Quietly does nothing when the backend cannot be reached: identity is never worth an error message. */
  async function load(): Promise<void> {
    if (info.value) return;
    try {
      info.value = await systemApi.about();
    } catch {
      // the backend-down overlay explains the real problem
    }
  }

  return { info, shortLabel, load };
});
