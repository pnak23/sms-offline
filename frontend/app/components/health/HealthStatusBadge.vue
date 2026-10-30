<script setup lang="ts">
import type { HealthStatus } from '~/types/api';
import { healthIcon, healthVariant } from '~/utils/health';

const props = defineProps<{ status: HealthStatus }>();

const { t } = useI18n();
// INFO items (e.g. "no backup yet") are notes, not problems: the overall badge shows them as OK.
const shown = computed<HealthStatus>(() => (props.status === 'INFO' ? 'OK' : props.status));
</script>

<template>
  <span class="badge health-badge" :class="`is-${healthVariant(shown)}`">
    <AppIcon :name="healthIcon(shown)" />{{ t(`health.overall.${shown}`) }}
  </span>
</template>
