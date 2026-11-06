<script setup lang="ts">
import { backupApi } from '~/services/backupApi';
import { openBackupsFolder } from '~/services/desktop';
import type { BackupItem, BackupOverview } from '~/types/api';
import { backupState } from '~/utils/backup';
import { formatDateTimeKm } from '~/utils/date';

// Backups: make one, check one, copy one to a USB stick (optional), delete one, restore one. The files are plain zips in the program's own folder on THIS laptop: that is the school's
// primary protection (the owner's policy of 2026-11-05). The page says how they stand, and says plainly what a backup kept on the laptop cannot protect against.
const { t, te } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const { copyToUsb, createNow } = useBackupActions();

const overview = ref<BackupOverview | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const creating = ref(false);
const busyId = ref<string | null>(null);
const removing = ref<BackupItem | null>(null);
const confirmRemove = ref(false);
const showRestore = ref(false);
const restoreListed = ref<string | null>(null);

const items = computed(() => overview.value?.backups ?? []);
const lastVerifiedId = computed(() => items.value.find((i) => backupState(i) === 'verified')?.id ?? null);
const lastRestore = computed(() => overview.value?.lastRestore ?? null);
const restoreProblem = computed(() => {
  const code = lastRestore.value?.code;
  if (!code) return '';
  return te(`error.${code}`) ? t(`error.${code}`) : t('backup.lastRestore.unknown');
});

async function load(): Promise<void> {
  loadError.value = null;
  try {
    overview.value = await backupApi.overview();
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function create(): Promise<void> {
  creating.value = true;
  try {
    await createNow();
  } finally {
    creating.value = false;
    await load();
  }
}

async function copy(id: string): Promise<void> {
  busyId.value = id;
  try {
    await copyToUsb(id);
  } finally {
    busyId.value = null;
    await load();
  }
}

async function verify(id: string): Promise<void> {
  busyId.value = id;
  try {
    const item = await backupApi.verify(id);
    if (item.verifyError) notify.error(t('backup.verifyBad'));
    else notify.success(t('backup.verifyGood'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busyId.value = null;
    await load();
  }
}

function askRemove(item: BackupItem): void {
  removing.value = item;
  confirmRemove.value = true;
}

async function remove(): Promise<void> {
  const item = removing.value;
  if (!item) return;
  busyId.value = item.id;
  try {
    await backupApi.remove(item.id);
    notify.success(t('backup.deleted'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busyId.value = null;
    confirmRemove.value = false;
    await load();
  }
}

function openRestore(listedId: string | null): void {
  restoreListed.value = listedId;
  showRestore.value = true;
}

async function discardStaged(): Promise<void> {
  try {
    await backupApi.cancelStaged();
  } catch (error) {
    notify.error(messageFor(error));
  }
  await load();
}

async function openFolder(): Promise<void> {
  try {
    await openBackupsFolder();
  } catch {
    notify.error(t('backup.openFolderFailed'));
  }
}

onMounted(load);
useReloadOnReconnect(load);
watch(showRestore, (open) => {
  if (!open) void load();
});
</script>

<template>
  <div class="page-container" data-testid="backup-page">
    <PageHeader :title="t('backup.title')" :subtitle="t('backup.subtitle')">
      <button type="button" class="btn btn-outline-secondary" data-testid="open-backups-folder" @click="openFolder"><AppIcon name="folder2-open" />{{ t('backup.openFolder') }}</button>
      <button type="button" class="btn btn-outline-secondary" data-testid="restore-from-file" @click="openRestore(null)"><AppIcon name="arrow-counterclockwise" />{{ t('backup.restoreFromFile') }}</button>
      <LoadingButton icon="archive" :loading="creating" data-testid="create-backup" @click="create">{{ t('backup.create') }}</LoadingButton>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <template v-if="overview">
        <BackupStatusAlert :overview="overview" />

        <div v-if="overview.staged && overview.staged.state === 'STAGED'" class="alert alert-warning d-flex align-items-start gap-2" role="alert" data-testid="staged-alert">
          <AppIcon name="exclamation-triangle-fill" class="mt-1" />
          <div class="me-auto">{{ t('backup.stagedWaiting', { date: formatDateTimeKm(overview.staged.backupCreatedAt) }) }}</div>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="discardStaged">{{ t('backup.stagedDiscard') }}</button>
        </div>

        <div v-if="lastRestore" class="alert" :class="lastRestore.ok ? 'alert-success' : 'alert-warning'" role="status" data-testid="last-restore">
          <AppIcon :name="lastRestore.ok ? 'check-circle-fill' : 'exclamation-triangle-fill'" class="mt-1" />
          <div>
            <div class="fw-semibold">
              {{ lastRestore.ok ? t('backup.lastRestore.ok', { date: formatDateTimeKm(lastRestore.at), made: lastRestore.backupCreatedAt ? formatDateTimeKm(lastRestore.backupCreatedAt) : '' }) : t('backup.lastRestore.failed', { date: formatDateTimeKm(lastRestore.at) }) }}
            </div>
            <div v-if="!lastRestore.ok">{{ restoreProblem }} {{ t('backup.lastRestore.unchanged') }}</div>
            <div v-else-if="lastRestore.safetyBackup">{{ t('backup.lastRestore.safety') }}</div>
            <div v-else-if="lastRestore.replacedFolder">{{ t('backup.lastRestore.replaced', { folder: lastRestore.replacedFolder }) }}</div>
          </div>
        </div>

        <div class="alert alert-info" role="note" data-testid="backup-limits">
          <AppIcon name="info-circle-fill" class="mt-1" />
          <div>
            <div class="fw-semibold">{{ t('backup.limits.title') }}</div>
            <div>{{ t('backup.limits.protects') }} {{ t('backup.limits.butNot') }}</div>
            <ul class="mb-1">
              <li>{{ t('backup.limits.ssd') }}</li>
              <li>{{ t('backup.limits.theft') }}</li>
              <li>{{ t('backup.limits.damage') }}</li>
            </ul>
            <div>{{ t('backup.limits.usb') }}</div>
          </div>
        </div>

        <BackupSummaryCards :overview="overview" />

        <div class="card">
          <div class="card-body">
            <h2 class="h5">{{ t('backup.listTitle') }}</h2>
            <p v-if="items.length === 0" class="text-muted mb-0" data-testid="backup-empty">{{ t('backup.empty') }}</p>
            <BackupTable
              v-else
              :items="items"
              :busy-id="busyId"
              :last-verified-id="lastVerifiedId"
              @copy="copy"
              @verify="verify"
              @restore="openRestore"
              @remove="askRemove"
            />
          </div>
        </div>
        <p class="text-muted small mt-2">{{ t('backup.rotationNote') }}</p>
      </template>
    </StateBlock>

    <ConfirmModal
      v-model="confirmRemove"
      :title="t('backup.deleteTitle')"
      :message="t('backup.deleteMessage', { date: removing ? formatDateTimeKm(removing.createdAt) : '' })"
      :confirm-label="t('common.delete')"
      :loading="busyId !== null"
      @confirm="remove"
    />
    <RestoreDialog v-model="showRestore" :listed-id="restoreListed" mode="settings" />
  </div>
</template>
