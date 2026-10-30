<script setup lang="ts">
// Wizard step 1: what this app is, and whether this PC is ready (backend quick checks + font + printers).
const emit = defineEmits<{ next: [] }>();

const { t } = useI18n();
const health = useHealthReport();
const client = useClientChecks();

const checks = computed(() => [...(health.report.value?.checks ?? []), ...client.checks.value]);
// Only a FAIL blocks; warnings are shown and the user can continue.
const blocked = computed(() => health.status.value === 'FAIL');

async function runChecks(): Promise<void> {
  await Promise.all([health.run('quick'), client.run()]);
}

onMounted(runChecks);
</script>

<template>
  <div>
    <p>{{ t('setup.welcome.intro') }}</p>

    <h3 class="h5 mt-3">{{ t('setup.welcome.checksTitle') }}</h3>
    <StateBlock :loading="health.loading.value && !health.report.value" :error="health.error.value" @retry="runChecks">
      <HealthCheckList :checks="checks" dense />
    </StateBlock>

    <div v-if="blocked" class="alert alert-danger" role="alert">
      <AppIcon name="x-circle-fill" class="mt-1" /><div>{{ t('setup.welcome.blocked') }}</div>
    </div>

    <div class="restore-note">
      <button type="button" class="btn btn-outline-secondary btn-sm" disabled>{{ t('setup.welcome.restore') }}</button>
      <span class="text-muted small">{{ t('setup.welcome.restoreLater') }}</span>
    </div>

    <div class="wizard-actions">
      <button type="button" class="btn btn-outline-secondary" :disabled="health.loading.value" @click="runChecks">
        <AppIcon name="arrow-clockwise" />{{ t('setup.welcome.recheck') }}
      </button>
      <LoadingButton icon="arrow-right" :disabled="blocked || !health.report.value" @click="emit('next')">{{ t('common.next') }}</LoadingButton>
    </div>
  </div>
</template>
