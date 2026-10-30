<script setup lang="ts">
import { BSpinner } from 'bootstrap-vue-next/components/BSpinner';
import { useAppStore } from '~/stores/app';

// Runtime loss of the backend. (Electron has its own start-up error window; this covers a backend that dies later.)
const { t } = useI18n();
const { errorText } = useApiError();
const app = useAppStore();
const { retry, restart } = useAppBootstrap();

const busy = ref(false);
const starting = computed(() => app.backendDown?.code === 'BACKEND_STARTING');
const detail = computed(() => (app.backendDown ? errorText(app.backendDown.code) : ''));

async function run(action: () => Promise<boolean>): Promise<void> {
  busy.value = true;
  try {
    await action();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="backend-overlay" role="alertdialog" aria-modal="true" :aria-label="t('backendDown.title')">
    <div class="card backend-card">
      <div class="card-body text-center">
        <div class="backend-icon" :class="{ 'is-waiting': starting }">
          <BSpinner v-if="starting" aria-hidden="true" />
          <AppIcon v-else name="wifi-off" />
        </div>
        <h2 class="h4">{{ starting ? t('backendDown.starting') : t('backendDown.title') }}</h2>
        <p v-if="!starting" class="mb-1">{{ t('backendDown.body') }}</p>
        <p class="text-muted small">{{ detail }}</p>
        <div v-if="!starting" class="d-flex gap-2 justify-content-center mt-3">
          <LoadingButton icon="arrow-clockwise" :loading="busy" @click="run(retry)">{{ t('common.retry') }}</LoadingButton>
          <LoadingButton variant="outline-secondary" icon="power" :disabled="busy" @click="run(restart)">
            {{ t('backendDown.restart') }}
          </LoadingButton>
        </div>
      </div>
    </div>
  </div>
</template>
