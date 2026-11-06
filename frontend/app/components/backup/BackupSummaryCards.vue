<script setup lang="ts">
import type { BackupOverview } from '~/types/api';
import { daysSince } from '~/utils/backup';
import { formatDateTimeKm } from '~/utils/date';

// Four facts a person wants at a glance: is there a recent backup, is it sound, is there a copy somewhere ELSE, is there room for the next one.
const props = defineProps<{ overview: BackupOverview }>();
const { t } = useI18n();

const lowSpace = computed(() => props.overview.freeMb >= 0 && props.overview.freeMb < props.overview.neededMb);
</script>

<template>
  <div class="row g-3 mb-3" data-testid="backup-summary">
    <div class="col-md-6 col-xl-3">
      <div class="card h-100"><div class="card-body">
        <div class="text-muted small">{{ t('backup.summary.last') }}</div>
        <div class="fw-semibold" data-testid="summary-last">{{ overview.lastBackupAt ? formatDateTimeKm(overview.lastBackupAt) : t('backup.summary.none') }}</div>
        <div v-if="overview.autoDue" class="text-muted small">{{ t('backup.summary.autoDue') }}</div>
      </div></div>
    </div>
    <div class="col-md-6 col-xl-3">
      <div class="card h-100"><div class="card-body">
        <div class="text-muted small">{{ t('backup.summary.verified') }}</div>
        <div class="fw-semibold" data-testid="summary-verified">{{ overview.lastVerifiedAt ? formatDateTimeKm(overview.lastVerifiedAt) : t('backup.summary.none') }}</div>
        <div class="text-muted small">{{ t('backup.summary.verifiedHint') }}</div>
      </div></div>
    </div>
    <div class="col-md-6 col-xl-3">
      <div class="card h-100" :class="{ 'border-warning': overview.externalOverdue }"><div class="card-body">
        <div class="text-muted small">{{ t('backup.summary.copy') }}</div>
        <div class="fw-semibold" data-testid="summary-copy">
          {{ overview.lastExternalCopyAt ? formatDateTimeKm(overview.lastExternalCopyAt) : t('backup.summary.neverCopied') }}
        </div>
        <div v-if="overview.externalOverdue" class="text-warning-emphasis small" data-testid="summary-overdue">
          <AppIcon name="exclamation-triangle-fill" />
          {{ overview.lastExternalCopyAt ? t('backup.summary.overdue', { days: daysSince(overview.lastExternalCopyAt), reminderDays: overview.reminderDays }) : t('backup.summary.overdueNever', { reminderDays: overview.reminderDays }) }}
        </div>
      </div></div>
    </div>
    <div class="col-md-6 col-xl-3">
      <div class="card h-100" :class="{ 'border-warning': lowSpace }"><div class="card-body">
        <div class="text-muted small">{{ t('backup.summary.space') }}</div>
        <div class="fw-semibold">{{ overview.freeMb < 0 ? t('backup.summary.spaceUnknown') : t('backup.summary.spaceFree', { mb: overview.freeMb }) }}</div>
        <div class="small" :class="lowSpace ? 'text-warning-emphasis' : 'text-muted'">
          {{ lowSpace ? t('backup.summary.spaceLow', { mb: overview.neededMb }) : t('backup.summary.spaceNeeded', { mb: overview.neededMb }) }}
        </div>
      </div></div>
    </div>
  </div>
</template>
