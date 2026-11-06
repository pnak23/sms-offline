<script setup lang="ts">
import { BSpinner } from 'bootstrap-vue-next/components/BSpinner';
import { onClosing } from '~/services/desktop';
import { useAppStore } from '~/stores/app';

// The program is closing and a backup is being made first (the newest one is a day old): say so, instead of looking frozen.
const { t } = useI18n();
const app = useAppStore();

const visible = ref(false);
let unsubscribe: (() => void) | null = null;

watch(
  () => app.connected,
  (connected) => {
    if (connected && !unsubscribe) unsubscribe = onClosing(() => (visible.value = true));
  },
  { immediate: true },
);
onBeforeUnmount(() => unsubscribe?.());
</script>

<template>
  <div v-if="visible" class="backend-overlay" role="alertdialog" aria-modal="true" :aria-label="t('backup.closing.title')" data-testid="closing-overlay">
    <div class="card backend-card">
      <div class="card-body text-center">
        <div class="backend-icon is-waiting"><BSpinner aria-hidden="true" /></div>
        <h2 class="h4">{{ t('backup.closing.title') }}</h2>
        <p class="text-muted mb-0">{{ t('backup.closing.body') }}</p>
      </div>
    </div>
  </div>
</template>
