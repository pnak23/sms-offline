<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { backupApi } from '~/services/backupApi';
import { pickBackupForRestore, restartBackend } from '~/services/desktop';
import type { StagedRestore } from '~/types/api';
import { formatBytes } from '~/utils/backup';
import { formatDateTimeKm } from '~/utils/date';

// Restoring a backup, step by step: choose it (or take one from the list), have it checked completely, read what it holds, confirm,
// and let the program restart. Nothing is replaced until the user confirms; the swap itself happens while the backend starts,
// before its database opens. Also used on a new PC, before any account exists (mode "setup").
const open = defineModel<boolean>({ required: true });
const props = withDefaults(defineProps<{ mode?: 'settings' | 'setup'; listedId?: string | null }>(), { mode: 'settings', listedId: null });

type Step = 'pick' | 'checking' | 'review' | 'applying' | 'failed';

const { t, te } = useI18n();
const { messageFor } = useApiError();

const step = ref<Step>('pick');
const staged = ref<StagedRestore | null>(null);
const problem = ref<string | null>(null);
const choosing = ref(false);

const facts = computed(() => {
  const s = staged.value;
  if (!s) return [];
  const count = (n: number) => (n < 0 ? '—' : String(n)); // -1: that version had no such table yet
  return [
    { key: 'made', value: formatDateTimeKm(s.backupCreatedAt) },
    { key: 'students', value: count(s.students) },
    { key: 'teachers', value: count(s.teachers) },
    { key: 'classes', value: count(s.classes) },
    { key: 'photos', value: String(s.photos) },
    { key: 'size', value: formatBytes(s.totalBytes) },
  ];
});

function reset(): void {
  staged.value = null;
  problem.value = null;
  choosing.value = false;
  step.value = props.listedId ? 'checking' : 'pick';
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  reset();
  if (props.listedId) void check(() => backupApi.stageListed(props.listedId as string));
});

async function check(stage: () => Promise<StagedRestore>): Promise<void> {
  step.value = 'checking';
  problem.value = null;
  try {
    staged.value = await stage();
    step.value = 'review';
  } catch (error) {
    problem.value = messageFor(error);
    step.value = 'failed';
  }
}

async function choose(): Promise<void> {
  choosing.value = true;
  problem.value = null;
  try {
    const picked = await pickBackupForRestore();
    if (!picked.picked) {
      if (picked.reason && picked.reason !== 'CANCELLED') {
        const key = `backup.restore.pick.${picked.reason}`;
        problem.value = t(te(key) ? key : 'backup.restore.pick.COPY_FAILED');
        step.value = 'failed';
      }
      return;
    }
    await check(() => backupApi.stageFile(picked.fileName as string));
  } catch {
    problem.value = t('backup.restore.pick.COPY_FAILED');
    step.value = 'failed';
  } finally {
    choosing.value = false;
  }
}

async function confirm(): Promise<void> {
  step.value = 'applying';
  problem.value = null;
  try {
    await backupApi.apply();
    await restartBackend(); // the backend closes, applies the restore before its database opens, and starts again
    window.location.assign('/login?restored=1'); // a full reload: nothing from before the restore stays in memory
  } catch (error) {
    problem.value = messageFor(error);
    step.value = 'failed';
  }
}

/** Closing at any point before the swap throws the staged copy away: nothing stays half chosen. */
async function cancel(): Promise<void> {
  if (step.value === 'applying') return;
  const had = staged.value;
  staged.value = null;
  if (had) await backupApi.cancelStaged().catch(() => undefined);
  open.value = false;
}

/** Whatever closes the dialog (the X, Escape, Cancel) goes through the same clean-up; while restoring, nothing closes it. */
function onHide(event: { preventDefault: () => void }): void {
  if (step.value === 'applying') {
    event.preventDefault();
    return;
  }
  void cancel();
}
</script>

<template>
  <BModal
    v-model="open"
    :title="t('backup.restore.title')"
    size="lg"
    lazy
    unmount-lazy
    centered
    no-close-on-backdrop
    :no-close-on-esc="step === 'applying'"
    :hide-header-close="step === 'applying'"
    @hide="onHide"
  >
    <div data-testid="restore-dialog" :data-step="step">
      <div v-if="step === 'pick'">
        <p>{{ props.mode === 'setup' ? t('backup.restore.introSetup') : t('backup.restore.intro') }}</p>
        <p class="text-muted mb-0">{{ t('backup.restore.introFile') }}</p>
      </div>

      <div v-else-if="step === 'checking'" class="state-block" role="status" aria-live="polite">
        <span class="spinner-border spinner-border-sm" aria-hidden="true" />
        <span>{{ t('backup.restore.checking') }}</span>
      </div>

      <div v-else-if="step === 'review' && staged">
        <p class="fw-semibold">{{ t('backup.restore.reviewTitle') }}</p>
        <dl class="restore-facts" data-testid="restore-facts">
          <template v-for="fact in facts" :key="fact.key">
            <dt>{{ t(`backup.restore.fact.${fact.key}`) }}</dt>
            <dd :data-fact="fact.key">{{ fact.value }}</dd>
          </template>
        </dl>
        <div class="alert alert-warning" role="alert">
          <AppIcon name="exclamation-triangle-fill" class="mt-1" />
          <ul class="mb-0 ps-3">
            <li>{{ props.mode === 'setup' ? t('backup.restore.warnNewPc') : t('backup.restore.warnReplace') }}</li>
            <li data-testid="restore-credentials-warning">{{ t('backup.restore.warnCredentials') }}</li>
            <li>{{ t('backup.restore.warnRestart') }}</li>
          </ul>
        </div>
      </div>

      <div v-else-if="step === 'applying'" class="state-block" role="status" aria-live="polite">
        <span class="spinner-border spinner-border-sm" aria-hidden="true" />
        <span>{{ t('backup.restore.applying') }}</span>
      </div>

      <div v-else class="alert alert-danger mb-0" role="alert" data-testid="restore-problem">
        <AppIcon name="x-circle-fill" class="mt-1" />
        <div>{{ problem }}</div>
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn btn-outline-secondary" :disabled="step === 'applying'" data-testid="restore-cancel" @click="cancel">
        {{ t('common.cancel') }}
      </button>
      <LoadingButton v-if="step === 'pick' || step === 'failed'" icon="folder2-open" :loading="choosing" data-testid="restore-choose" @click="choose">
        {{ step === 'failed' ? t('backup.restore.chooseAnother') : t('backup.restore.choose') }}
      </LoadingButton>
      <LoadingButton v-else-if="step === 'review'" variant="danger" icon="arrow-counterclockwise" data-testid="restore-confirm" @click="confirm">
        {{ t('backup.restore.confirm') }}
      </LoadingButton>
    </template>
  </BModal>
</template>
