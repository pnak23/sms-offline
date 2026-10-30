<script setup lang="ts">
import type { HealthCheck, HealthReport } from '~/types/api';

// The check list with "Check again" and "Run deep check" (full integrity check; takes longer).
defineProps<{
  report: HealthReport | null;
  extraChecks: HealthCheck[];
  loading: boolean;
  deepRunning: boolean;
  error: string | null;
}>();

defineEmits<{ recheck: []; deep: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="card h-100">
    <div class="card-header d-flex align-items-center gap-2">
      <AppIcon name="heart-pulse" />
      <span class="me-auto">{{ t('health.checksTitle') }}</span>
      <HealthStatusBadge v-if="report" :status="report.status" />
    </div>
    <div class="card-body">
      <StateBlock :loading="loading && !report" :error="error" @retry="$emit('recheck')">
        <HealthCheckList v-if="report" :checks="[...report.checks, ...extraChecks]" />
      </StateBlock>
    </div>
    <div class="card-footer d-flex gap-2 flex-wrap">
      <LoadingButton variant="outline-secondary" icon="arrow-clockwise" :loading="loading && !deepRunning" :disabled="deepRunning" @click="$emit('recheck')">
        {{ t('health.recheck') }}
      </LoadingButton>
      <LoadingButton variant="outline-primary" icon="heart-pulse" :loading="deepRunning" :disabled="loading && !deepRunning" @click="$emit('deep')">
        {{ t('health.deepCheck') }}
      </LoadingButton>
      <span v-if="deepRunning" class="text-muted align-self-center">{{ t('health.deepRunning') }}</span>
      <span v-else-if="report" class="text-muted align-self-center small ms-auto">{{ t('health.checkedAt', { time: formatDateTimeKm(report.generatedAt) }) }}</span>
    </div>
  </div>
</template>
