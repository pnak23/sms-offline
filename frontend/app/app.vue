<script setup lang="ts">
import { BApp } from 'bootstrap-vue-next/components/BApp';
import { useAppStore } from '~/stores/app';
import { usePreferencesStore } from '~/stores/preferences';
import { useSchoolStore } from '~/stores/school';
import { useSessionStore } from '~/stores/session';

const app = useAppStore();
const session = useSessionStore();
const school = useSchoolStore();
const preferences = usePreferencesStore();

useIdleLock();

// Whatever the signed-in screens need everywhere (header school name/logo, idle-lock minutes) loads once after sign-in.
watch(
  () => session.isAuthenticated,
  (signedIn) => {
    if (signedIn) void Promise.allSettled([school.load(), preferences.load()]);
    else {
      school.reset();
      preferences.reset();
    }
  },
  { immediate: true },
);
</script>

<template>
  <BApp>
    <!-- inert: while locked, nothing underneath can be reached with the mouse, keyboard or a screen reader -->
    <div class="app-root" :inert="session.locked || undefined">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>
    <LockOverlay v-if="session.locked" />
    <BackendOverlay v-if="app.backendDown" />
  </BApp>
</template>
