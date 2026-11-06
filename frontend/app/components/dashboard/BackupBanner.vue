<script setup lang="ts">
import type { HealthCheck } from '~/types/api';
import { checkMessageKeys } from '~/utils/health';

// Two health checks come here. BACKUP_AGE is the backups kept on THIS laptop, the school's primary protection (the owner's policy of 2026-11-05): shown on the dashboard in every state.
// When a good backup is less than 24 hours old it is a QUIET line (the owner, 2026-11-06: a big green box that never changes is noise): a small check mark, the status, a link to the Backup
// page and an information button that opens the complete note of what a backup kept only on the laptop cannot protect against (closed by default, kept in memory only). When there is no
// good backup, or the newest good one is 24 hours old or more, it is the warning box, unchanged: the note always visible and a "back up now" button. EXTERNAL_COPY is the OPTIONAL copy
// on a USB stick: it only appears, as a warning, when the school switched its reminder on.
const props = defineProps<{ check: HealthCheck }>();
const emit = defineEmits<{ changed: [] }>();

const { t, te } = useI18n();
const { createNow } = useBackupActions();

const busy = ref(false);
const local = computed(() => props.check.id === 'BACKUP_AGE');
const ok = computed(() => props.check.status === 'OK');
const quiet = computed(() => local.value && ok.value);
const open = ref(false);
const noteId = `backup-limits-${String(useId()).replace(/[^a-zA-Z0-9_-]/g, '')}`;
const text = computed(() => {
  const key = checkMessageKeys(props.check).find((candidate) => te(candidate));
  return key ? t(key, props.check.params) : t('dashboard.backupGeneric');
});
const title = computed(() => (local.value ? t(ok.value ? 'dashboard.backupOkTitle' : 'dashboard.backupTitle') : t('dashboard.backupCopyTitle')));

async function backUpNow(): Promise<void> {
  busy.value = true;
  try {
    if (await createNow()) emit('changed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="quiet" class="backup-line" role="status" :data-testid="`backup-status-${check.id}`" :data-state="check.status">
    <div class="backup-line-main">
      <AppIcon name="check-circle-fill" class="backup-line-ok" />
      <span class="backup-line-title no-break">{{ title }}</span>
      <span class="backup-line-text">{{ text }}</span>
      <div class="backup-line-actions">
        <button type="button" class="backup-line-action no-break" :aria-expanded="open" :aria-controls="noteId" data-testid="backup-limits-toggle" @click="open = !open">
          <AppIcon name="info-circle-fill" />{{ t('dashboard.backupLimitsToggle') }}
        </button>
        <NuxtLink to="/settings/backup" class="backup-line-action no-break" data-testid="backup-banner-link">{{ t('dashboard.backupOpen') }}</NuxtLink>
      </div>
    </div>
    <div v-show="open" :id="noteId" class="backup-line-note" data-testid="backup-limits-note">{{ t('dashboard.backupLimits') }}</div>
  </div>
  <div v-else class="alert" :class="ok ? 'alert-success' : 'alert-warning'" role="alert" :data-testid="`backup-status-${check.id}`" :data-state="check.status">
    <AppIcon :name="ok ? 'check-circle-fill' : 'archive'" class="mt-1" />
    <div class="me-auto">
      <div class="fw-semibold">{{ title }}</div>
      <div>{{ text }}</div>
      <div v-if="local" class="small mt-1" data-testid="backup-limits-note">{{ t('dashboard.backupLimits') }}</div>
    </div>
    <div class="d-flex flex-wrap gap-2 align-self-center">
      <LoadingButton v-if="local && !ok" icon="archive" :loading="busy" data-testid="backup-banner-now" @click="backUpNow">{{ t('dashboard.backupAction') }}</LoadingButton>
      <NuxtLink to="/settings/backup" class="btn btn-sm btn-outline-dark align-self-center text-nowrap" data-testid="backup-banner-link">{{ t('dashboard.backupOpen') }}</NuxtLink>
    </div>
  </div>
</template>
