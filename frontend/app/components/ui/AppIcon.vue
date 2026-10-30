<script setup lang="ts">
// Bootstrap Icons through @iconify/vue in OFFLINE mode: the collection is registered in plugins/03.icons.ts.
import { Icon } from '@iconify/vue/dist/offline';

defineProps<{ name: string }>();
</script>

<template>
  <Icon :icon="`bi:${name}`" class="app-icon" aria-hidden="true" />
</template>
