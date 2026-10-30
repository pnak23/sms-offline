import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { settingsApi } from '../services/settingsApi';
import type { SchoolProfile } from '../types/api';

/** The school profile (name, address, logo). The logo is fetched with the token and shown through a blob URL. */
export const useSchoolStore = defineStore('school', () => {
  const profile = ref<SchoolProfile | null>(null);
  const logoUrl = ref<string | null>(null);
  const loading = ref(false);
  let shownLogoFile: string | null = null;

  const name = computed(() => profile.value?.nameKm?.trim() ?? '');
  const hasName = computed(() => name.value.length > 0);

  function releaseLogo(): void {
    if (logoUrl.value) URL.revokeObjectURL(logoUrl.value);
    logoUrl.value = null;
    shownLogoFile = null;
  }

  async function refreshLogo(): Promise<void> {
    const file = profile.value?.logoFile ?? null;
    if (file === shownLogoFile) return;
    releaseLogo();
    if (!file) return;
    try {
      logoUrl.value = URL.createObjectURL(await settingsApi.logoBlob(file));
      shownLogoFile = file;
    } catch {
      // a missing logo file is reported by the deep health check; the UI just shows no logo
    }
  }

  /** Adopt a profile returned by the API (GET, PUT, logo upload/delete) so the version stays current. */
  async function apply(next: SchoolProfile): Promise<void> {
    profile.value = next;
    await refreshLogo();
  }

  async function load(): Promise<SchoolProfile> {
    loading.value = true;
    try {
      const fresh = await settingsApi.school();
      await apply(fresh);
      return fresh;
    } finally {
      loading.value = false;
    }
  }

  function reset(): void {
    releaseLogo();
    profile.value = null;
  }

  return { profile, logoUrl, loading, name, hasName, load, apply, reset };
});
