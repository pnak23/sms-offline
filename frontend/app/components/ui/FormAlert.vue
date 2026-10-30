<script setup lang="ts">
// One place for "the form failed" messages: a countdown while the account is locked, otherwise the translated error.
defineProps<{
  message?: string | null;
  /** Seconds left of an ACCOUNT_LOCKED lock (0 = not locked). */
  lockedSeconds?: number;
  /** The same time as m:ss. */
  lockLabel?: string;
}>();

const { t } = useI18n();
</script>

<template>
  <div v-if="lockedSeconds && lockedSeconds > 0" class="alert alert-warning" role="alert">
    <AppIcon name="lock-fill" class="mt-1" />
    <div>
      <div class="fw-semibold">{{ t('auth.locked.title') }}</div>
      <div>{{ t('auth.locked.body', { time: lockLabel }) }}</div>
    </div>
  </div>
  <div v-else-if="message" class="alert alert-danger" role="alert">
    <AppIcon name="exclamation-circle" class="mt-1" />
    <div>{{ message }}</div>
  </div>
</template>
