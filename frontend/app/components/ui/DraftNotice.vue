<script setup lang="ts">
import { useAcceptanceStore } from '~/stores/acceptance';

// "This is a placeholder": shown on a screen that depends on information only the school or an official source can give, until the
// administrator signs that item off on the About page. Nothing is hidden or blocked; it just never lets a placeholder look official.
// `compact` is the same notice as one line with a link, for inside a card (the dashboard's examination chart).
defineProps<{ item: string; textKey: string; compact?: boolean }>();

const { t } = useI18n();
const acceptance = useAcceptanceStore();
</script>

<template>
  <div v-if="!acceptance.signed(item) && compact" class="draft-notice-compact" role="note" :data-testid="`draft-${item}`">
    <AppIcon name="exclamation-triangle-fill" />
    <span class="me-auto"><strong>{{ t('acceptance.draft.title') }}</strong> · {{ t(textKey) }}</span>
    <NuxtLink to="/settings/about" class="btn btn-sm btn-outline-dark text-nowrap">{{ t('acceptance.draft.link') }}</NuxtLink>
  </div>
  <div v-else-if="!acceptance.signed(item)" class="alert alert-warning draft-notice" role="note" :data-testid="`draft-${item}`">
    <AppIcon name="exclamation-triangle-fill" class="mt-1" />
    <div class="me-auto">
      <div class="fw-semibold">{{ t('acceptance.draft.title') }}</div>
      <div>{{ t(textKey) }}</div>
    </div>
    <NuxtLink to="/settings/about" class="btn btn-sm btn-outline-dark align-self-center text-nowrap">{{ t('acceptance.draft.link') }}</NuxtLink>
  </div>
</template>
