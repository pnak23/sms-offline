<script setup lang="ts">
import { exportDiagnostics, openLogsFolder } from '~/services/desktop';
import { systemApi } from '~/services/systemApi';
import type { SystemInfo } from '~/types/api';

// System health: backend checks, a deep check on demand, memory, printers, font; logs folder and diagnostics export.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const health = useHealthReport();
const client = useClientChecks();

const info = ref<SystemInfo | null>(null);
const infoError = ref<string | null>(null);
const deepRunning = ref(false);
const exporting = ref(false);

async function loadAll(): Promise<void> {
  const loadInfo = systemApi
    .info()
    .then((value) => {
      info.value = value;
      infoError.value = null;
    })
    .catch((error: unknown) => {
      infoError.value = messageFor(error);
    });
  await Promise.all([health.run('quick'), client.run(), loadInfo]);
}

async function runDeep(): Promise<void> {
  deepRunning.value = true;
  try {
    await health.run('deep');
  } finally {
    deepRunning.value = false;
  }
}

async function onOpenLogs(): Promise<void> {
  try {
    await openLogsFolder();
  } catch {
    notify.error(t('health.logsFailed'));
  }
}

// Codes, numbers and device names only: no school, student or account data goes into the file.
async function onExport(): Promise<void> {
  if (!health.report.value) return;
  exporting.value = true;
  try {
    const result = await exportDiagnostics({
      backend: health.report.value,
      info: info.value,
      metrics: client.metrics.value,
      fontLoaded: client.fontLoaded.value,
      printers: client.printers.value,
    });
    if (result.saved) notify.success(t('health.exported'));
  } catch {
    notify.error(t('health.exportFailed'));
  } finally {
    exporting.value = false;
  }
}

onMounted(loadAll);
useReloadOnReconnect(loadAll);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('health.title')" :subtitle="t('health.subtitle')">
      <button type="button" class="btn btn-outline-secondary" @click="onOpenLogs"><AppIcon name="folder2-open" />{{ t('health.openLogs') }}</button>
      <LoadingButton variant="outline-primary" icon="download" :loading="exporting" :disabled="!health.report.value" @click="onExport">
        {{ t('health.exportDiagnostics') }}
      </LoadingButton>
    </PageHeader>

    <div class="row g-3">
      <div class="col-xl-7">
        <HealthChecksCard
          :report="health.report.value"
          :extra-checks="client.checks.value"
          :loading="health.loading.value"
          :deep-running="deepRunning"
          :error="health.error.value"
          @recheck="loadAll"
          @deep="runDeep"
        />
      </div>
      <div class="col-xl-5">
        <ResourcesCard
          :info="info"
          :info-error="infoError"
          :metrics="client.metrics.value"
          :printers="client.printers.value"
          :font-loaded="client.fontLoaded.value"
        />
      </div>
    </div>
  </div>
</template>
