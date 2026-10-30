<script setup lang="ts">
import type { HealthCheck } from '~/types/api';
import { checkMessageKeys } from '~/utils/health';

// The BACKUP_AGE check is WARN: the last backup is older than the reminder interval (or the backup folder is unreadable).
const props = defineProps<{ check: HealthCheck }>();

const { t, te } = useI18n();
const text = computed(() => {
  const key = checkMessageKeys(props.check).find((candidate) => te(candidate));
  return key ? t(key, props.check.params) : t('dashboard.backupGeneric');
});
</script>

<template>
  <div class="alert alert-warning" role="alert">
    <AppIcon name="archive" class="mt-1" />
    <div>
      <div class="fw-semibold">{{ t('dashboard.backupTitle') }}</div>
      <div>{{ text }}</div>
    </div>
  </div>
</template>
