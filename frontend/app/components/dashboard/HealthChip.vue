<script setup lang="ts">
import type { HealthStatus } from '~/types/api';
import { healthIcon, healthVariant } from '~/utils/health';

// Shown on the dashboard ONLY when something needs attention (WARN or FAIL): no alert fatigue (docs R24).
defineProps<{ status: HealthStatus }>();

const { t } = useI18n();
</script>

<template>
  <NuxtLink to="/settings/system" class="health-chip" :class="`is-${healthVariant(status)}`">
    <AppIcon :name="healthIcon(status)" />
    <span>{{ t(`dashboard.healthChip.${status}`) }}</span>
    <AppIcon name="arrow-right" />
  </NuxtLink>
</template>
