<script setup lang="ts">
import type { SystemInfo } from '~/types/api';

// Memory and devices: the backend's JVM heap, the desktop app's memory, the printers Windows knows, the Khmer font.
const props = defineProps<{
  info: SystemInfo | null;
  infoError: string | null;
  metrics: DesktopMetrics | null;
  printers: DesktopPrinter[] | null;
  fontLoaded: boolean | null;
}>();

const { t, n } = useI18n();

const heapPercent = computed(() => (props.info ? Math.min(100, Math.round((props.info.heapUsedMb / Math.max(1, props.info.heapMaxMb)) * 100)) : 0));
const startup = computed(() => Object.entries(props.info?.startup ?? {}));
</script>

<template>
  <div class="card h-100">
    <div class="card-header"><AppIcon name="cpu" class="me-2" />{{ t('health.resources.title') }}</div>
    <div class="card-body">
      <h3 class="h6">{{ t('health.resources.backend') }}</h3>
      <div v-if="infoError" class="text-danger mb-3">{{ infoError }}</div>
      <template v-else-if="info">
        <div class="progress mb-1" role="progressbar" :aria-valuenow="heapPercent" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar" :class="{ 'bg-warning': heapPercent > 85 }" :style="{ width: `${heapPercent}%` }" />
        </div>
        <p class="mb-1">
          {{ t('health.resources.heap', { used: n(info.heapUsedMb), max: n(info.heapMaxMb), committed: n(info.heapCommittedMb) }) }}
        </p>
        <p class="text-muted mb-2">{{ t('health.resources.versions', { app: info.appVersion, java: info.java }) }}</p>
        <details v-if="startup.length" class="mb-3">
          <summary>{{ t('health.resources.startup') }}</summary>
          <ul class="startup-list">
            <li v-for="[key, ms] in startup" :key="key"><span>{{ key }}</span><span>{{ n(ms) }} ms</span></li>
          </ul>
        </details>
      </template>

      <h3 class="h6 mt-2">{{ t('health.resources.app') }}</h3>
      <p v-if="metrics" class="mb-3">{{ t('health.resources.appMemory', { mb: n(metrics.totalWorkingSetMb), count: metrics.processCount }) }}</p>
      <p v-else class="text-muted mb-3">{{ t('health.resources.unavailable') }}</p>

      <h3 class="h6">{{ t('health.resources.printers') }}</h3>
      <ul v-if="printers && printers.length" class="printer-list mb-3">
        <li v-for="printer in printers" :key="printer.name">
          <AppIcon name="printer" />
          <span class="printer-name" :title="printer.name">{{ printer.name }}</span>
          <span v-if="printer.isDefault" class="badge text-bg-secondary">{{ t('health.resources.defaultPrinter') }}</span>
        </li>
      </ul>
      <p v-else class="text-muted mb-3">{{ printers ? t('health.checks.PRINTERS.NONE') : t('health.resources.unavailable') }}</p>

      <h3 class="h6">{{ t('health.resources.font') }}</h3>
      <p class="mb-0">
        <template v-if="fontLoaded === null">-</template>
        <template v-else>{{ fontLoaded ? t('health.checks.FONTS.OK') : t('health.checks.FONTS.NOT_BUNDLED') }}</template>
      </p>
    </div>
  </div>
</template>
