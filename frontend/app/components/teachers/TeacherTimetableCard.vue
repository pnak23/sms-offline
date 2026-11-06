<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { timetableApi } from '~/services/timetableApi';
import type { TimetableTeacherView } from '~/types/api';

// A teacher's own page: how many lessons they have in the week (the current year, else the first year) and the week itself, read-only. The full picture, with printing and
// Excel, is the Timetable page's "by teacher" tab.
const props = defineProps<{ teacherId: number }>();

const { t } = useI18n();
const { messageFor } = useApiError();

const view = ref<TimetableTeacherView | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const years = await academicApi.years();
    const year = years.find((y) => y.current) ?? years[0];
    view.value = year ? await timetableApi.teacherView(props.teacherId, year.id) : null;
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="card mt-3" data-testid="teacher-timetable">
    <div class="card-body">
      <h2 class="h5">{{ t('teachers.timetableTitle') }}</h2>
      <StateBlock :loading="loading" :error="loadError" @retry="load">
        <p v-if="!view" class="text-muted mb-0">{{ t('classes.noYear') }}</p>
        <template v-else>
          <p class="mb-2" data-testid="teacher-timetable-count">
            {{ view.yearName }} · <strong>{{ t('timetable.teacherLessons', { n: view.lessonCount }) }}</strong>
            <NuxtLink :to="`/timetable?tab=teacher&yearId=${view.yearId}&teacherId=${view.teacherId}`" class="ms-2">{{ t('timetable.openFull') }}</NuxtLink>
          </p>
          <p v-if="view.grid.slots.length === 0" class="text-muted mb-0" data-testid="teacher-timetable-unconfigured">{{ t('timetable.unconfiguredTitle') }}</p>
          <p v-else-if="view.lessonCount === 0" class="text-muted mb-0" data-testid="teacher-timetable-empty">{{ t('timetable.teacherEmpty') }}</p>
          <TimetableGrid v-else :grid="view.grid" mode="teacher" />
        </template>
      </StateBlock>
    </div>
  </div>
</template>
