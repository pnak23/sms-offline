<script setup lang="ts">
import type { BackupItem } from '~/types/api';
import { backupState, formatBytes } from '~/utils/backup';
import { formatDateTimeKm } from '~/utils/date';

// The list of backups on this PC: what each one is, whether it was read back whole, whether a copy exists elsewhere, and what can be done.
defineProps<{ items: BackupItem[]; busyId: string | null; lastVerifiedId: string | null }>();
const emit = defineEmits<{ copy: [id: string]; verify: [id: string]; restore: [id: string]; remove: [item: BackupItem] }>();

const { t, te } = useI18n();

function problemText(item: BackupItem): string {
  const key = `error.${item.verifyError}`;
  return te(key) ? t(key) : t('backup.status.damaged');
}
</script>

<template>
  <div class="table-responsive scroll-x">
    <table class="table align-middle mb-0" data-testid="backup-table">
      <thead>
        <tr>
          <th>{{ t('backup.col.date') }}</th>
          <th>{{ t('backup.col.kind') }}</th>
          <th class="text-end">{{ t('backup.col.size') }}</th>
          <th>{{ t('backup.col.status') }}</th>
          <th>{{ t('backup.col.copy') }}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id" data-testid="backup-row" :data-backup-id="item.id" :data-kind="item.kind">
          <td class="fw-medium text-nowrap">{{ formatDateTimeKm(item.createdAt) }}</td>
          <td>{{ t(`backup.kind.${item.kind}`) }}</td>
          <td class="text-end text-nowrap">{{ formatBytes(item.sizeBytes) }}</td>
          <td>
            <span v-if="backupState(item) === 'verified'" class="badge text-bg-success" data-status="verified">
              <AppIcon name="shield-check" />{{ t('backup.status.verified') }}
            </span>
            <span v-else-if="backupState(item) === 'damaged'" class="badge text-bg-danger" data-status="damaged" :title="problemText(item)">
              <AppIcon name="x-circle-fill" />{{ t('backup.status.damaged') }}
            </span>
            <span v-else class="badge text-bg-secondary" data-status="unchecked">{{ t('backup.status.unchecked') }}</span>
          </td>
          <td class="text-nowrap" data-col="copy">{{ item.externalCopyAt ? formatDateTimeKm(item.externalCopyAt) : '—' }}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busyId !== null" :data-testid="`copy-${item.id}`" @click="emit('copy', item.id)">
              <AppIcon name="usb-drive" />{{ t('backup.action.copy') }}
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm ms-1" :disabled="busyId !== null" :data-testid="`verify-${item.id}`" @click="emit('verify', item.id)">
              <AppIcon name="shield-check" />{{ t('backup.action.verify') }}
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm ms-1" :disabled="busyId !== null || backupState(item) === 'damaged'" :data-testid="`restore-${item.id}`" @click="emit('restore', item.id)">
              <AppIcon name="arrow-counterclockwise" />{{ t('backup.action.restore') }}
            </button>
            <button
              type="button"
              class="btn btn-outline-danger btn-sm ms-1"
              :disabled="busyId !== null || item.id === lastVerifiedId"
              :title="item.id === lastVerifiedId ? t('backup.action.lastGood') : undefined"
              :data-testid="`delete-${item.id}`"
              @click="emit('remove', item)"
            >
              <AppIcon name="trash" />{{ t('common.delete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
