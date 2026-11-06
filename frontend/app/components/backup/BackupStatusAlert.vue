<script setup lang="ts">
import type { BackupOverview } from '~/types/api';
import { formatDateTimeKm } from '~/utils/date';

// The backups kept on THIS laptop are the school's primary protection (the owner's policy of 2026-11-05), so the page says at the top how they stand:
// a good backup less than 24 hours old (green), or the newest good one is 24 hours old or more, or there is none (a warning). A backup counts only if it was read back whole.
const props = defineProps<{ overview: BackupOverview }>();
const { t } = useI18n();

const ok = computed(() => props.overview.localState === 'OK');
const params = computed(() => ({ date: props.overview.lastVerifiedAt ? formatDateTimeKm(props.overview.lastVerifiedAt) : '', hours: props.overview.localAgeHours ?? 0 }));
</script>

<template>
  <div class="alert d-flex align-items-start gap-2" :class="ok ? 'alert-success' : 'alert-warning'" role="status" data-testid="backup-status" :data-state="overview.localState">
    <AppIcon :name="ok ? 'check-circle-fill' : 'exclamation-triangle-fill'" class="mt-1" />
    <div>
      <div class="fw-semibold">{{ t(`backup.status.${overview.localState}`) }}</div>
      <div>{{ t(`backup.status.${overview.localState}Detail`, params) }}</div>
    </div>
  </div>
</template>
