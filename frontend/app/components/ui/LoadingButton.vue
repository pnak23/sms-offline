<script setup lang="ts">
import { BButton } from 'bootstrap-vue-next/components/BButton';
import { BSpinner } from 'bootstrap-vue-next/components/BSpinner';

withDefaults(
  defineProps<{
    variant?: 'primary' | 'outline-primary' | 'outline-secondary' | 'danger' | 'success' | 'link';
    type?: 'button' | 'submit';
    size?: 'sm' | 'lg';
    loading?: boolean;
    disabled?: boolean;
    icon?: string;
  }>(),
  { variant: 'primary', type: 'button' },
);
</script>

<template>
  <BButton :variant="variant" :type="type" :size="size" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <BSpinner v-if="loading" small aria-hidden="true" />
    <AppIcon v-else-if="icon" :name="icon" />
    <slot />
  </BButton>
</template>
