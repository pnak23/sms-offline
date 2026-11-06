<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';
import { keepKhmerNumerals } from '~/utils/khmerNumerals';

// Every printed page sits in this layout; with the "Khmer numerals" setting on, its digits are shown as Khmer digits (the toolbar is not).
const preferences = usePreferencesStore();
const root = ref<HTMLElement | null>(null);
let stop: (() => void) | null = null;

watch(
  [root, () => preferences.khmerNumerals],
  ([el, on]) => {
    stop?.();
    stop = el && on ? keepKhmerNumerals(el) : null;
  },
  { immediate: true, flush: 'post' },
);
onBeforeUnmount(() => stop?.());
</script>

<template>
  <div ref="root" class="print-screen">
    <slot />
  </div>
</template>
