<script setup lang="ts">
import type { HealthCheck } from '~/types/api';
import { checkMessageKeys, checkTitleKey, healthIcon, healthVariant } from '~/utils/health';

const props = defineProps<{ check: HealthCheck }>();

const { t, te, n } = useI18n();

// Friendlier numbers for the sentences: thousands separators, and disk space also in GB.
const params = computed(() => {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props.check.params)) out[key] = typeof value === 'number' ? n(value) : value;
  const free = props.check.params.freeMb;
  if (typeof free === 'number') out.freeGb = n(Math.round((free / 1024) * 10) / 10);
  return out;
});

const title = computed(() => (te(checkTitleKey(props.check)) ? t(checkTitleKey(props.check)) : props.check.id));
const message = computed(() => {
  const key = checkMessageKeys(props.check).find((candidate) => te(candidate));
  return key ? t(key, params.value) : t('health.unknownCode', { code: props.check.code });
});
</script>

<template>
  <li class="health-row" :class="`is-${healthVariant(check.status)}`">
    <AppIcon :name="healthIcon(check.status)" class="health-row-icon" :title="t(`health.status.${check.status}`)" />
    <div class="health-row-text">
      <span class="health-row-title">{{ title }}</span>
      <span class="health-row-message">{{ message }}</span>
    </div>
    <span class="visually-hidden">{{ t(`health.status.${check.status}`) }}</span>
  </li>
</template>
