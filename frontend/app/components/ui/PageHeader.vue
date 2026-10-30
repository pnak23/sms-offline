<script setup lang="ts">
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <div class="page-header">
    <div class="page-header-text">
      <h1 class="mb-0">{{ title }}</h1>
      <p v-if="subtitle" class="text-muted mb-0">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.default" class="page-header-actions">
      <slot />
    </div>
  </div>
</template>
