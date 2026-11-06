<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { backupApi } from '~/services/backupApi';
import { cancelClose, onCloseRequested, quitApp } from '~/services/desktop';
import { useAppStore } from '~/stores/app';
import { useSessionStore } from '~/stores/session';
import type { BackupOverview } from '~/types/api';
import { daysSince, newestVerified } from '~/utils/backup';

// When the window is closed, the shell asks this page first. If the last copy on a USB stick is older than the reminder interval
// (or there never was one), offer to make it now. The question can never trap anybody: if anything goes wrong the program closes.
const { t } = useI18n();
const app = useAppStore();
const session = useSessionStore();
const { copyToUsb, createNow } = useBackupActions();

const open = ref(false);
const busy = ref(false);
const overview = ref<BackupOverview | null>(null);
let unsubscribe: (() => void) | null = null;

const days = computed(() => (overview.value?.lastExternalCopyAt ? daysSince(overview.value.lastExternalCopyAt) : null));

async function onCloseAsked(): Promise<void> {
  if (open.value) return; // already asking
  if (!session.isAuthenticated) {
    void quitApp();
    return;
  }
  try {
    overview.value = await backupApi.overview();
    if (overview.value.externalOverdue) {
      open.value = true;
      void cancelClose(); // answers the shell's question ("not yet"): the buttons below decide, however long that takes
      return;
    }
  } catch {
    // cannot ask the backend: do not make the user pay for it
  }
  void quitApp();
}

async function copyAndClose(): Promise<void> {
  busy.value = true;
  try {
    const candidate = newestVerified(overview.value?.backups ?? []) ?? (await createNow());
    if (!candidate) return;
    if ((await copyToUsb(candidate.id)) === 'recorded') await quitApp();
  } finally {
    busy.value = false;
  }
}

watch(
  () => app.connected,
  (connected) => {
    if (connected && !unsubscribe) unsubscribe = onCloseRequested(() => void onCloseAsked());
  },
  { immediate: true },
);
onBeforeUnmount(() => unsubscribe?.());
</script>

<template>
  <BModal v-model="open" :title="t('backup.exit.title')" lazy unmount-lazy centered no-close-on-backdrop :no-close-on-esc="busy" :hide-header-close="busy">
    <p data-testid="exit-backup-text">
      {{ days === null ? t('backup.exit.never') : t('backup.exit.old', { days, reminderDays: overview?.reminderDays ?? 7 }) }}
    </p>
    <p class="text-muted mb-0">{{ t('backup.exit.why') }}</p>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary me-auto" :disabled="busy" data-testid="exit-stay" @click="open = false">{{ t('backup.exit.stay') }}</button>
      <button type="button" class="btn btn-outline-danger" :disabled="busy" data-testid="exit-anyway" @click="quitApp()">{{ t('backup.exit.closeAnyway') }}</button>
      <LoadingButton icon="usb-drive" :loading="busy" data-testid="exit-copy" @click="copyAndClose">{{ t('backup.exit.copyNow') }}</LoadingButton>
    </template>
  </BModal>
</template>
