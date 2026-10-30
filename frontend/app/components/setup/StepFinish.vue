<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { setupApi } from '~/services/setupApi';
import { useAppStore } from '~/stores/app';
import { usePreferencesStore } from '~/stores/preferences';
import { useSchoolStore } from '~/stores/school';
import { useSessionStore } from '~/stores/session';
import { useSetupStore } from '~/stores/setup';
import type { AcademicYear } from '~/types/api';
import { isApiError } from '~/utils/apiError';
import { ROUTES } from '~/utils/guards';
import { needsAttention } from '~/utils/health';

// Wizard step 7: a summary, one last health look, then POST /setup/complete.
const emit = defineEmits<{ back: [] }>();

const { t } = useI18n();
const notify = useNotify();
const app = useAppStore();
const setup = useSetupStore();
const school = useSchoolStore();
const session = useSessionStore();
const preferences = usePreferencesStore();
const health = useHealthReport();
const currentYear = ref<AcademicYear | null>(null);
const finishing = useSubmit({ fields: [] });

async function onFinish(): Promise<void> {
  const done = await finishing.run(async () => {
    try {
      await setupApi.complete();
      return true;
    } catch (error) {
      if (isApiError(error) && error.code === 'RECOVERY_KEY_NOT_CONFIRMED') {
        // The key was never confirmed (e.g. the app was closed in step 3): the guard sends the user to issue and confirm a new one.
        notify.warning(t('error.RECOVERY_KEY_NOT_CONFIRMED'));
        await app.refreshStatus();
        await navigateTo(ROUTES.forcedRecoveryKey, { replace: true });
        return false;
      }
      throw error;
    }
  });
  if (!done) return;
  await app.refreshStatus();
  setup.reset();
  notify.success(t('setup.finish.done'));
  await navigateTo(ROUTES.dashboard, { replace: true });
}

onMounted(async () => {
  void health.run('quick');
  try {
    currentYear.value = (await academicApi.years()).find((y) => y.current) ?? null;
  } catch {
    currentYear.value = null; // the summary just shows "not set"
  }
});
</script>

<template>
  <div>
    <p>{{ t('setup.finish.intro') }}</p>

    <dl class="summary-list">
      <dt>{{ t('setup.finish.admin') }}</dt>
      <dd>{{ session.user?.username ?? '-' }}</dd>
      <dt>{{ t('setup.finish.school') }}</dt>
      <dd>{{ school.hasName ? school.name : t('setup.finish.notSet') }}</dd>
      <dt>{{ t('setup.finish.year') }}</dt>
      <dd>{{ currentYear ? currentYear.nameKm : t('setup.finish.notSet') }}</dd>
      <dt>{{ t('setup.finish.reminder') }}</dt>
      <dd>{{ t('setup.finish.days', { n: preferences.backupReminderDays }) }}</dd>
      <dt>{{ t('setup.finish.idleLock') }}</dt>
      <dd>{{ t('setup.finish.minutes', { n: preferences.idleLockMinutes }) }}</dd>
      <dt>{{ t('setup.finish.health') }}</dt>
      <dd>
        <span v-if="health.loading.value" class="text-muted">{{ t('common.loading') }}</span>
        <HealthStatusBadge v-else-if="health.status.value" :status="health.status.value" />
        <span v-else class="text-muted">-</span>
      </dd>
    </dl>

    <div v-if="health.status.value && needsAttention(health.status.value)" class="alert alert-warning" role="status">
      <AppIcon name="exclamation-triangle-fill" class="mt-1" /><div>{{ t('setup.finish.healthNote') }}</div>
    </div>
    <p v-if="setup.schoolSkipped || setup.academicSkipped" class="text-muted">{{ t('setup.finish.skippedNote') }}</p>

    <FormAlert :message="finishing.formError.value" />
    <div class="wizard-actions">
      <button type="button" class="btn btn-outline-secondary" :disabled="finishing.submitting.value" @click="emit('back')">
        <AppIcon name="arrow-left" />{{ t('common.back') }}
      </button>
      <LoadingButton size="lg" icon="check-lg" :loading="finishing.submitting.value" @click="onFinish">{{ t('setup.finish.start') }}</LoadingButton>
    </div>
  </div>
</template>
