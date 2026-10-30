<script setup lang="ts">
import type { SetupTask } from '~/types/ui';

// What is still missing from the first-launch set-up. Shown only while there is something to do.
defineProps<{ tasks: SetupTask[] }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="tasks.length" class="card tasks-card">
    <div class="card-header"><AppIcon name="clipboard-check" class="me-2" />{{ t('dashboard.tasks.title') }}</div>
    <ul class="list-group list-group-flush">
      <li v-for="task in tasks" :key="task.id" class="list-group-item task-item">
        <AppIcon :name="task.icon" class="task-icon" />
        <div class="task-text">
          <div class="fw-semibold">{{ t(task.titleKey) }}</div>
          <div class="text-muted">{{ t(task.hintKey) }}</div>
        </div>
        <NuxtLink :to="task.to" class="btn btn-outline-primary btn-sm">{{ t('dashboard.tasks.open') }}</NuxtLink>
      </li>
    </ul>
  </div>
</template>
