<script setup lang="ts">
import { reportsApi } from '~/services/reportsApi';
import { saveFile } from '~/services/desktop';
import { timetableApi } from '~/services/timetableApi';
import type { Teacher, TimetableTeacherLoad, TimetableTeacherView } from '~/types/api';
import { sortByKhmer } from '~/utils/sort';
import { teacherTimetableTable } from '~/utils/timetableTables';

// A teacher's week across every class of the year (read-only) with the total number of lessons. A teacher with no lesson, and a year with no slots, are normal states.
const teacherId = defineModel<number | null>('teacherId', { required: true });
const props = defineProps<{
  yearId: number | null;
  teachers: Teacher[];
  returnPath: string;
}>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const view = ref<TimetableTeacherView | null>(null);
const loads = ref<TimetableTeacherLoad[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const busy = ref<'excel' | null>(null);

const lessonsOf = (id: number): number => loads.value.find((l) => l.teacherId === id)?.lessons ?? 0;
const options = computed(() => sortByKhmer(props.teachers, (x) => x.nameKm));
const slotsExist = computed(() => (view.value?.grid.slots.length ?? 0) > 0);

async function load(): Promise<void> {
  error.value = null;
  if (props.yearId === null) {
    view.value = null;
    loads.value = [];
    return;
  }
  loading.value = true;
  try {
    loads.value = await timetableApi.teacherLoads(props.yearId);
    view.value = teacherId.value === null ? null : await timetableApi.teacherView(teacherId.value, props.yearId);
  } catch (raised) {
    view.value = null;
    error.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

async function print(): Promise<void> {
  if (teacherId.value === null || props.yearId === null) return;
  await navigateTo({ path: '/print/report', query: { name: 'timetableTeacher', teacherId: String(teacherId.value), yearId: String(props.yearId), back: props.returnPath } });
}

async function exportExcel(): Promise<void> {
  if (!view.value) return;
  busy.value = 'excel';
  try {
    const table = teacherTimetableTable(t, view.value);
    const result = await saveFile(`${table.sheetName}.xlsx`, await reportsApi.exportTable(table));
    if (result.saved) notify.success(t('students.exported'));
  } catch (raised) {
    notify.error(messageFor(raised));
  } finally {
    busy.value = null;
  }
}

watch([teacherId, () => props.yearId], load, { immediate: true });
</script>

<template>
  <div>
    <div class="filter-bar">
      <div>
        <label for="tt-teacher-pick" class="visually-hidden">{{ t('timetable.pickTeacher') }}</label>
        <select id="tt-teacher-pick" v-model="teacherId" class="form-select" data-testid="tt-teacher-pick">
          <option :value="null">{{ t('timetable.pickTeacher') }}</option>
          <option v-for="x in options" :key="x.id" :value="x.id">{{ x.nameKm }}{{ x.status === 'INACTIVE' ? ` (${t('teacherStatus.INACTIVE')})` : '' }} — {{ t('timetable.teacherLessons', { n: lessonsOf(x.id) }) }}</option>
        </select>
      </div>
    </div>

    <StateBlock :loading="loading && !view" :error="error" @retry="load">
      <p v-if="teacherId === null" class="mb-0" data-testid="tt-no-teacher">{{ t('timetable.pickTeacherHint') }}</p>
      <template v-else-if="view">
        <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
          <p class="fw-medium mb-0 me-auto" data-testid="tt-teacher-count">{{ t('timetable.teacherLessons', { n: view.lessonCount }) }}</p>
          <button type="button" class="btn btn-outline-primary btn-sm" data-testid="tt-print" :disabled="view.lessonCount === 0" @click="print"><AppIcon name="printer" />{{ t('print.print') }}</button>
          <LoadingButton variant="outline-primary" size="sm" icon="file-earmark-excel" :loading="busy === 'excel'" :disabled="view.lessonCount === 0 || busy !== null" data-testid="tt-excel" @click="exportExcel">{{ t('reports.excel') }}</LoadingButton>
        </div>
        <p v-if="view.yearClosed" class="alert alert-secondary" role="status">{{ t('timetable.yearClosed') }}</p>
        <div v-if="!slotsExist" class="alert alert-info" role="status" data-testid="tt-unconfigured">
          <div class="fw-semibold">{{ t('timetable.unconfiguredTitle') }}</div>
          <div>{{ t('timetable.unconfiguredText') }}</div>
          <NuxtLink to="/settings/timetable" class="btn btn-sm btn-outline-dark mt-2">{{ t('nav.timetableSettings') }}</NuxtLink>
        </div>
        <template v-else>
          <p v-if="view.lessonCount === 0" class="alert alert-light border" role="status" data-testid="tt-teacher-empty">{{ t('timetable.teacherEmpty') }}</p>
          <TimetableGrid v-else :grid="view.grid" mode="teacher" />
        </template>
      </template>
    </StateBlock>
  </div>
</template>
