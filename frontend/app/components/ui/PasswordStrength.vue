<script setup lang="ts">
import { passwordStrength } from '~/utils/password';

// A hint under the password field. It never blocks anything: the rules are in the field's validation.
const props = defineProps<{ password: string; username?: string }>();

const { t } = useI18n();
const level = computed(() => passwordStrength(props.password, props.username));
const segments = computed(() => ({ none: 0, weak: 1, fair: 2, good: 3 })[level.value]);
</script>

<template>
  <div v-if="level !== 'none'" class="strength" :data-level="level" aria-live="polite">
    <div class="strength-bar" aria-hidden="true">
      <span v-for="n in 3" :key="n" class="strength-segment" :class="{ 'is-on': n <= segments }" />
    </div>
    <span class="strength-label">{{ t(`auth.strength.${level}`) }}</span>
  </div>
</template>
