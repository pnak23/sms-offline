<script setup lang="ts">
import { getAppMetrics, getDesktopConfig, relaunchApp, updateDesktopConfig } from '~/services/desktop';

// Performance presets: Standard follows the PC's memory, Low-memory asks the program for less. A change applies at the next start
// (the backend's memory is fixed when it starts), so saving offers to restart.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const PRESETS: DesktopPreset[] = ['standard', 'low-memory'];

const saved = ref<DesktopConfig | null>(null);
const metrics = ref<DesktopMetrics | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const saving = ref(false);
const askRestart = ref(false);
const restarting = ref(false);
const form = reactive<DesktopConfig>({ preset: 'standard', disableGpu: false });

const dirty = computed(() => !!saved.value && (form.preset !== saved.value.preset || form.disableGpu !== saved.value.disableGpu));

async function load(): Promise<void> {
  loadError.value = null;
  try {
    saved.value = await getDesktopConfig();
    Object.assign(form, saved.value);
    metrics.value = await getAppMetrics().catch(() => null);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    saved.value = await updateDesktopConfig({ preset: form.preset, disableGpu: form.disableGpu });
    notify.success(t('performance.saved'));
    askRestart.value = true;
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    saving.value = false;
  }
}

async function restartNow(): Promise<void> {
  restarting.value = true;
  try {
    await relaunchApp();
  } catch (error) {
    restarting.value = false;
    askRestart.value = false;
    notify.error(messageFor(error));
  }
}

onMounted(load);
</script>

<template>
  <div class="page-container is-narrow" data-testid="performance-page">
    <PageHeader :title="t('performance.title')" :subtitle="t('performance.subtitle')" />

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <div v-if="saved" class="card">
        <div class="card-body">
          <p v-if="metrics" class="text-muted" data-testid="performance-current">{{ t('performance.current', { mb: metrics.totalWorkingSetMb }) }}</p>

          <fieldset class="mb-3">
            <legend class="h6">{{ t('performance.presetTitle') }}</legend>
            <div v-for="preset in PRESETS" :key="preset" class="form-check preset-option">
              <input :id="`preset-${preset}`" v-model="form.preset" class="form-check-input" type="radio" name="preset" :value="preset" :data-testid="`preset-${preset}`" />
              <label class="form-check-label" :for="`preset-${preset}`">
                <span class="fw-semibold">{{ t(`performance.preset.${preset}.name`) }}</span>
                <span class="d-block text-muted small">{{ t(`performance.preset.${preset}.hint`) }}</span>
              </label>
            </div>
          </fieldset>

          <div class="form-check form-switch mb-3">
            <input id="gpu-off" v-model="form.disableGpu" class="form-check-input" type="checkbox" role="switch" data-testid="gpu-off" />
            <label class="form-check-label" for="gpu-off">
              <span class="fw-semibold">{{ t('performance.graphics.name') }}</span>
              <span class="d-block text-muted small">{{ t('performance.graphics.hint') }}</span>
            </label>
          </div>

          <div class="alert alert-info" role="note"><AppIcon name="info-circle-fill" class="mt-1" /><div>{{ t('performance.restartNote') }}</div></div>

          <LoadingButton icon="check-lg" :loading="saving" :disabled="!dirty" data-testid="performance-save" @click="save">{{ t('common.save') }}</LoadingButton>
        </div>
      </div>
    </StateBlock>

    <ConfirmModal
      v-model="askRestart"
      :title="t('performance.restartTitle')"
      :message="t('performance.restartMessage')"
      :confirm-label="t('performance.restartNow')"
      variant="primary"
      :loading="restarting"
      @confirm="restartNow"
    />
  </div>
</template>
