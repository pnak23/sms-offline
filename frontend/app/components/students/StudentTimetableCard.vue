<script setup lang="ts">
import { reportsApi } from '~/services/reportsApi';
import { saveFile } from '~/services/desktop';
import { timetableApi } from '~/services/timetableApi';
import type { TimetableStudentView } from '~/types/api';
import { studentTimetableTable } from '~/utils/timetableTables';

// The student's week: the timetable of the class the student is in (the current year; else the latest year the student had a class). Read-only, and nothing is stored about
// the student. A student with no class, a class with no lessons yet and a year whose slots the school has not entered are normal states with their own words.
const props = defineProps<{ studentId: number; studentName: string }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const view = ref<TimetableStudentView | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busy = ref(false);

const slotsExist = computed(() => (view.value?.grid.slots.length ?? 0) > 0);
const hasLessons = computed(() => (view.value?.grid.lessons.length ?? 0) > 0);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    view.value = await timetableApi.studentView(props.studentId);
  } catch (error) {
    // a student with no class in any year has nothing to show: not an error for the page
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function print(): Promise<void> {
  if (!view.value) return;
  await navigateTo({ path: '/print/report', query: { name: 'timetableStudent', studentId: String(props.studentId), yearId: String(view.value.yearId), back: `/students/${props.studentId}` } });
}

async function exportExcel(): Promise<void> {
  if (!view.value) return;
  busy.value = true;
  try {
    const table = studentTimetableTable(t, view.value, props.studentName);
    const result = await saveFile(`${table.sheetName}.xlsx`, await reportsApi.exportTable(table));
    if (result.saved) notify.success(t('students.exported'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="card mt-3" data-testid="student-timetable">
    <div class="card-body">
      <h2 class="h5">{{ t('students.timetableTitle') }}</h2>
      <StateBlock :loading="loading" :error="loadError" @retry="load">
        <template v-if="view">
          <p v-if="view.state === 'NOT_ENROLLED'" class="text-muted mb-0" data-testid="student-timetable-none">{{ t('timetable.studentNotEnrolled', { year: view.yearName }) }}</p>
          <template v-else>
            <p class="text-muted small mb-2" data-testid="student-timetable-class">{{ view.gradeName }} {{ view.className }} · {{ view.yearName }}</p>
            <div v-if="!slotsExist" class="alert alert-info mb-0" role="status" data-testid="student-timetable-unconfigured">
              <div class="fw-semibold">{{ t('timetable.unconfiguredTitle') }}</div>
              <div>{{ t('timetable.unconfiguredText') }}</div>
            </div>
            <p v-else-if="!hasLessons" class="text-muted mb-0" data-testid="student-timetable-empty">{{ t('timetable.classEmptyClosed') }}</p>
            <template v-else>
              <div class="d-flex flex-wrap gap-2 mb-2">
                <button type="button" class="btn btn-outline-primary btn-sm" data-testid="student-timetable-print" @click="print"><AppIcon name="printer" />{{ t('print.print') }}</button>
                <LoadingButton variant="outline-primary" size="sm" icon="file-earmark-excel" :loading="busy" :disabled="busy" data-testid="student-timetable-excel" @click="exportExcel">{{ t('reports.excel') }}</LoadingButton>
              </div>
              <TimetableGrid :grid="view.grid" mode="class" />
            </template>
          </template>
        </template>
      </StateBlock>
    </div>
  </div>
</template>
