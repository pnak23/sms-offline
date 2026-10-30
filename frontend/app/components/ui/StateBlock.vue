<script setup lang="ts">
import { BSpinner } from 'bootstrap-vue-next/components/BSpinner';

// Loading / error / empty / content in one wrapper, so every data view handles its states the same way.
defineProps<{
  loading?: boolean;
  /** Already translated message; shows the error state with a retry button. */
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
}>();

defineEmits<{ retry: [] }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="loading" class="state-block" role="status" aria-live="polite">
    <BSpinner small aria-hidden="true" />
    <span>{{ t('common.loading') }}</span>
  </div>
  <div v-else-if="error" class="state-block is-error" role="alert">
    <AppIcon name="exclamation-circle" />
    <span>{{ error }}</span>
    <button type="button" class="btn btn-outline-secondary btn-sm" @click="$emit('retry')">
      <AppIcon name="arrow-clockwise" />{{ t('common.retry') }}
    </button>
  </div>
  <div v-else-if="empty" class="state-block">
    <span class="text-muted">{{ emptyText ?? t('common.empty') }}</span>
  </div>
  <slot v-else />
</template>
