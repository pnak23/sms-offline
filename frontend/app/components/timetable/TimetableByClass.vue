<script setup lang="ts">
import { reportsApi } from '~/services/reportsApi';
import { saveFile } from '~/services/desktop';
import { timetableApi } from '~/services/timetableApi';
import type { ClassDto, TimetableClassView, TimetableLesson } from '~/types/api';
import { classTimetableTable } from '~/utils/timetableTables';

// The class's week: the editor. An empty class, or a year whose slots the school has not entered yet, is a normal state with its own message, never an error. A closed
// year shows the week read-only. Print and Excel use the same table as every other report.
const props = defineProps<{
  yearId: number | null;
  classId: number | null;
  classes: ClassDto[];
  /** The address of this page with its current choices, so the printed page's Back returns to it. */
  returnPath: string;
}>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const view = ref<TimetableClassView | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
// an editor needs every slot (a lesson can only be added to a row that is drawn): they are all shown until the person switches it off to hide the ones this class never uses
const showAll = ref(true);
const busy = ref<'excel' | null>(null);

const cellOpen = ref(false);
const cellDay = ref<number | null>(null);
const cellSlot = ref<number | null>(null);
const cellLesson = ref<TimetableLesson | null>(null);
const copyOpen = ref(false);

const slotsExist = computed(() => (view.value?.grid.slots.length ?? 0) > 0);
const hasLessons = computed(() => (view.value?.grid.lessons.length ?? 0) > 0);
const editable = computed(() => !!view.value && !view.value.yearClosed && slotsExist.value);
const candidates = computed(() => {
  const self = props.classes.find((c) => c.id === props.classId);
  return self ? props.classes.filter((c) => c.academicYearId === self.academicYearId && c.gradeId === self.gradeId) : [];
});

async function load(): Promise<void> {
  error.value = null;
  if (props.classId === null) {
    view.value = null;
    return;
  }
  loading.value = true;
  try {
    view.value = await timetableApi.classView(props.classId);
  } catch (raised) {
    view.value = null;
    error.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

function openCell(day: number, slotId: number, lesson: TimetableLesson | null): void {
  cellDay.value = day;
  cellSlot.value = slotId;
  cellLesson.value = lesson;
  cellOpen.value = true;
}

async function print(): Promise<void> {
  if (props.classId === null) return;
  await navigateTo({ path: '/print/report', query: { name: 'timetableClass', classId: String(props.classId), back: props.returnPath } });
}

async function exportExcel(): Promise<void> {
  if (!view.value) return;
  busy.value = 'excel';
  try {
    const table = classTimetableTable(t, view.value);
    const result = await saveFile(`${table.sheetName}.xlsx`, await reportsApi.exportTable(table));
    if (result.saved) notify.success(t('students.exported'));
  } catch (raised) {
    notify.error(messageFor(raised));
  } finally {
    busy.value = null;
  }
}

watch(() => props.classId, load, { immediate: true });
defineExpose({ load });
</script>

<template>
  <StateBlock :loading="loading && !view" :error="error" @retry="load">
    <p v-if="classId === null" class="mb-0" data-testid="tt-no-class">{{ t('classes.noneInYear') }}</p>
    <template v-else-if="view">
      <div class="d-flex flex-wrap gap-2 align-items-center mb-3" data-testid="tt-class-tools">
        <div class="form-check form-switch mb-0 me-auto">
          <input id="tt-show-all-slots" v-model="showAll" type="checkbox" role="switch" class="form-check-input" data-testid="tt-show-all-slots" />
          <label for="tt-show-all-slots" class="form-check-label">{{ t('timetable.showAllSlots') }}</label>
        </div>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-testid="tt-copy-open" :disabled="!editable" @click="copyOpen = true"><AppIcon name="files" />{{ t('timetable.copy.fromClass') }}</button>
        <button type="button" class="btn btn-outline-primary btn-sm" data-testid="tt-print" :disabled="!hasLessons" @click="print"><AppIcon name="printer" />{{ t('print.print') }}</button>
        <LoadingButton variant="outline-primary" size="sm" icon="file-earmark-excel" :loading="busy === 'excel'" :disabled="!hasLessons || busy !== null" data-testid="tt-excel" @click="exportExcel">{{ t('reports.excel') }}</LoadingButton>
      </div>

      <p v-if="view.yearClosed" class="alert alert-secondary" role="status" data-testid="tt-closed">{{ t('timetable.yearClosed') }}</p>

      <div v-if="!slotsExist" class="alert alert-info" role="status" data-testid="tt-unconfigured">
        <div class="fw-semibold">{{ t('timetable.unconfiguredTitle') }}</div>
        <div>{{ t('timetable.unconfiguredText') }}</div>
        <NuxtLink to="/settings/timetable" class="btn btn-sm btn-outline-dark mt-2">{{ t('nav.timetableSettings') }}</NuxtLink>
      </div>
      <template v-else>
        <p v-if="!hasLessons" class="alert alert-light border" role="status" data-testid="tt-class-empty">{{ view.yearClosed ? t('timetable.classEmptyClosed') : t('timetable.classEmpty') }}</p>
        <p v-else class="small text-muted mb-2" data-testid="tt-class-count">{{ t('timetable.lessonsInWeek', { n: view.grid.lessons.length }) }}</p>
        <TimetableGrid :grid="view.grid" mode="class" :editable="editable" :show-all="showAll" @cell="openCell" />
      </template>

      <TimetableCellModal v-model="cellOpen" :view="view" :day="cellDay" :slot-id="cellSlot" :lesson="cellLesson" @saved="load" />
      <TimetableCopyModal v-model="copyOpen" :class-id="view.classId" :candidates="candidates" @done="load" />
    </template>
  </StateBlock>
</template>
