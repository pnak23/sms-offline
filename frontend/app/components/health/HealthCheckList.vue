<script setup lang="ts">
import type { HealthCheck } from '~/types/api';

defineProps<{ checks: HealthCheck[]; dense?: boolean }>();
</script>

<template>
  <ul class="health-list" :class="{ 'is-dense': dense }">
    <HealthCheckRow v-for="check in checks" :key="check.id" :check="check" />
  </ul>
</template>
