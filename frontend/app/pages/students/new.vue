<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import type { ClassDto, StudentDetail } from '~/types/api';
import { compareKhmer } from '~/utils/sort';

// Register a student. The classes offered are those of the current academic year; choosing one enrols the student at once.
const { t } = useI18n();
const { messageFor } = useApiError();

const classes = ref<ClassDto[]>([]);
const hasYear = ref(true);
const loading = ref(true);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const year = (await academicApi.years()).find((y) => y.current && y.status === 'OPEN');
    hasYear.value = year !== undefined;
    classes.value = year
      ? [...(await classesApi.list({ yearId: year.id }))].sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm))
      : [];
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function saved(detail: StudentDetail): Promise<void> {
  await navigateTo(`/students/${detail.student.id}`);
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container is-form">
    <PageHeader :title="t('students.addTitle')" :subtitle="t('students.addSubtitle')" />
    <div class="card">
      <div class="card-body">
        <StateBlock :loading="loading" :error="loadError" @retry="load">
          <p v-if="!hasYear" class="text-muted">{{ t('students.noCurrentYear') }}</p>
          <StudentForm :detail="null" :classes="classes" @saved="saved" @cancel="navigateTo('/students')" />
        </StateBlock>
      </div>
    </div>
  </div>
</template>
