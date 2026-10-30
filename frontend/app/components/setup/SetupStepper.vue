<script setup lang="ts">
import { SETUP_STEP_COUNT } from '~/stores/setup';

defineProps<{ current: number }>();

const { t } = useI18n();
const steps = Array.from({ length: SETUP_STEP_COUNT }, (_, i) => i + 1);
</script>

<template>
  <ol class="stepper" :aria-label="t('setup.progressLabel', { current, total: SETUP_STEP_COUNT })">
    <li
      v-for="n in steps"
      :key="n"
      class="stepper-item"
      :class="{ 'is-done': n < current, 'is-current': n === current }"
      :aria-current="n === current ? 'step' : undefined"
    >
      <span class="stepper-dot">
        <AppIcon v-if="n < current" name="check-lg" />
        <template v-else>{{ n }}</template>
      </span>
      <span class="stepper-label">{{ t(`setup.steps.${n}`) }}</span>
    </li>
  </ol>
</template>
