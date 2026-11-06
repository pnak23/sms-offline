<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { timetableApi } from '~/services/timetableApi';
import type { TimetableClassView, TimetableLesson } from '~/types/api';
import { isApiError } from '~/utils/apiError';
import { slotTimes } from '~/utils/timetable';

// One cell of a class's week: a subject (the main subjects the grade studies) AND a teacher. Save stays off until both are chosen. The teachers offered are the class's own
// assigned teachers; "show all active teachers" adds the rest. Choosing a subject fills in the teacher the class has for it (a person can still pick another). A clash
// (that teacher already has another class at that time) is shown inside the pop-up and names the other class. "Clear" empties the cell.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  view: TimetableClassView;
  day: number | null;
  slotId: number | null;
  lesson: TimetableLesson | null;
}>();
const emit = defineEmits<{ saved: [] }>();

const { t } = useI18n();
const { messageFor, validationText } = useApiError();
const notify = useNotify();

const subjectId = ref<number | null>(null);
const teacherId = ref<number | null>(null);
const showAll = ref(false);
const touchedTeacher = ref(false);
const busy = ref<'save' | 'clear' | null>(null);
const error = ref<string | null>(null);

const slot = computed(() => props.view.grid.slots.find((s) => s.id === props.slotId) ?? null);
const title = computed(() =>
  props.day && slot.value ? t('timetable.cell.title', { day: t(`timetable.day.${props.day}`), slot: slot.value.nameKm, times: slotTimes(slot.value) }) : t('timetable.cell.titleShort'),
);
const teacherOptions = computed(() => props.view.teachers.filter((x) => showAll.value || x.assigned || x.id === teacherId.value));
const canSave = computed(() => subjectId.value !== null && teacherId.value !== null && busy.value === null);

// The modal is mounted lazily: every time it opens it starts from the cell it was opened for.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    error.value = null;
    touchedTeacher.value = false;
    subjectId.value = props.lesson?.subjectId ?? null;
    const current = props.lesson && props.lesson.teacherActive ? props.lesson.teacherId : null;
    teacherId.value = current;
    // a lesson whose teacher does not teach this class: show everyone, or the choice would be hidden
    showAll.value = current !== null && !props.view.teachers.some((x) => x.id === current && x.assigned);
  },
  { immediate: true },
);

watch(subjectId, (id) => {
  if (touchedTeacher.value || id === null) return;
  const choice = props.view.subjects.find((s) => s.id === id);
  if (choice?.teacherId && choice.teacherActive) teacherId.value = choice.teacherId;
});

function failure(raised: unknown): string {
  if (isApiError(raised) && raised.code === 'TIMETABLE_TEACHER_CLASH') {
    const extra = raised.extra;
    return t('timetable.clash', { className: `${String(extra.gradeName ?? '')} ${String(extra.className ?? '')}`.trim(), day: t(`timetable.day.${Number(extra.dayOfWeek)}`), slot: String(extra.slotName ?? '') });
  }
  if (isApiError(raised) && raised.fieldErrors[0]) return validationText(raised.fieldErrors[0].code);
  return messageFor(raised);
}

async function save(): Promise<void> {
  if (!canSave.value || props.day === null || props.slotId === null) return;
  busy.value = 'save';
  error.value = null;
  try {
    await timetableApi.setCell(props.view.classId, props.day, props.slotId, subjectId.value as number, teacherId.value as number);
    notify.success(t('timetable.cell.saved'));
    open.value = false;
    emit('saved');
  } catch (raised) {
    error.value = failure(raised);
  } finally {
    busy.value = null;
  }
}

async function clear(): Promise<void> {
  if (props.day === null || props.slotId === null) return;
  busy.value = 'clear';
  error.value = null;
  try {
    await timetableApi.clearCell(props.view.classId, props.day, props.slotId);
    notify.success(t('timetable.cell.cleared'));
    open.value = false;
    emit('saved');
  } catch (raised) {
    error.value = failure(raised);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <BModal v-model="open" :title="title" centered lazy unmount-lazy no-close-on-backdrop :no-close-on-esc="busy !== null" data-testid="tt-cell-modal">
    <p v-if="error" class="alert alert-danger" role="alert" data-testid="tt-cell-error">{{ error }}</p>
    <div class="mb-3">
      <label for="tt-subject" class="form-label">{{ t('timetable.cell.subject') }}</label>
      <select id="tt-subject" v-model="subjectId" class="form-select" data-testid="tt-subject">
        <option :value="null">{{ t('timetable.cell.chooseSubject') }}</option>
        <option v-for="s in view.subjects" :key="s.id" :value="s.id">{{ s.nameKm }}</option>
      </select>
      <div v-if="view.subjects.length === 0" class="form-text text-warning-emphasis" data-testid="tt-no-subjects">{{ t('timetable.cell.noSubjects') }}</div>
    </div>
    <div class="mb-2">
      <label for="tt-teacher" class="form-label">{{ t('timetable.cell.teacher') }}</label>
      <select id="tt-teacher" v-model="teacherId" class="form-select" data-testid="tt-teacher" @change="touchedTeacher = true">
        <option :value="null">{{ t('timetable.cell.chooseTeacher') }}</option>
        <option v-for="x in teacherOptions" :key="x.id" :value="x.id">{{ x.nameKm }}{{ x.assigned ? '' : ` (${t('timetable.cell.notAssigned')})` }}</option>
      </select>
    </div>
    <div class="form-check form-switch mb-3">
      <input id="tt-show-all" v-model="showAll" type="checkbox" role="switch" class="form-check-input" data-testid="tt-show-all-teachers" />
      <label for="tt-show-all" class="form-check-label">{{ t('timetable.cell.showAllTeachers') }}</label>
    </div>
    <p v-if="!canSave && busy === null" class="small text-muted mb-0" data-testid="tt-both-required">{{ t('timetable.cell.bothRequired') }}</p>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary me-auto" :disabled="busy !== null" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton v-if="lesson" variant="outline-secondary" icon="trash" :loading="busy === 'clear'" :disabled="busy !== null" data-testid="tt-clear" @click="clear">{{ t('timetable.cell.clear') }}</LoadingButton>
      <LoadingButton icon="check-lg" :loading="busy === 'save'" :disabled="!canSave" data-testid="tt-save" @click="save">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
