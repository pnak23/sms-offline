<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { homeworkApi } from '~/services/homeworkApi';
import type { Homework, HomeworkRecordInput, HomeworkRecordSheet, HomeworkRecordStatus } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { HOMEWORK_RECORD_STATUSES, canHaveMark, classAverage, handedIn, notRecordedCount, subjectLabel } from '~/utils/homework';
import { formatNumber, parseDecimal } from '~/utils/score';
import { sortByKhmer } from '~/utils/sort';

// The students of one assignment: for each, a submission status the teacher chooses (no status = not recorded yet), a mark when the homework has a maximum, and a remark.
// A mark belongs to work that was handed in, so typing one on a blank row marks it "submitted", and a status that cannot have a mark clears it. An empty mark is "not entered",
// never 0, and a student who did not hand it in is never turned into a 0. Homework marks are never part of an examination.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ homework: Homework | null; closed: boolean }>();
const emit = defineEmits<{ saved: [] }>();

interface RowState {
  enrollmentId: number;
  studentCode: string;
  nameKm: string;
  status: HomeworkRecordStatus | '';
  score: string;
  remark: string;
}

const { t } = useI18n();
const notify = useNotify();
const { messageFor, validationText } = useApiError();
const submit = useSubmit({ fields: [] });

const sheet = ref<HomeworkRecordSheet | null>(null);
const rows = ref<RowState[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
let baseline = '';

/** The homework as the server last said it (counts after a save), else the one the list passed in. */
const current = computed<Homework | null>(() => sheet.value?.homework ?? props.homework);
const maxScore = computed(() => current.value?.maxScore ?? null);

const snapshot = () => JSON.stringify(rows.value.map((r) => [r.enrollmentId, r.status, r.score.trim(), r.remark.trim()]));
const dirty = computed(() => rows.value.length > 0 && snapshot() !== baseline);

function problemOf(row: RowState): 'INVALID_NUMBER' | 'OUT_OF_RANGE' | null {
  const text = row.score.trim();
  if (text === '' || maxScore.value === null) return null;
  const n = parseDecimal(text);
  if (Number.isNaN(n)) return 'INVALID_NUMBER';
  return n > maxScore.value ? 'OUT_OF_RANGE' : null;
}
const hasProblem = computed(() => rows.value.some((r) => problemOf(r) !== null));

function adopt(next: HomeworkRecordSheet): void {
  sheet.value = next;
  rows.value = sortByKhmer(next.rows, (r) => r.nameKm).map((r) => ({
    enrollmentId: r.enrollmentId,
    studentCode: r.studentCode,
    nameKm: r.nameKm,
    status: r.status ?? '',
    score: formatNumber(r.score),
    remark: r.remark ?? '',
  }));
  baseline = snapshot();
}

async function load(): Promise<void> {
  const h = props.homework;
  sheet.value = null;
  rows.value = [];
  baseline = snapshot();
  loadError.value = null;
  submit.clearError();
  if (!h) return;
  loading.value = true;
  try {
    const next = await homeworkApi.records(h.id);
    if (props.homework?.id === h.id) adopt(next);
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [open.value, props.homework?.id] as const,
  ([isOpen]) => {
    if (isOpen) void load();
  },
  { immediate: true },
);

/** A status that cannot have a mark (or none) takes the mark away. */
function onStatus(row: RowState): void {
  if (!canHaveMark(row.status)) row.score = '';
}

/** Typing a mark on a student with no status means the work was handed in. */
function onScore(row: RowState): void {
  if (row.score.trim() !== '' && row.status === '') row.status = 'SUBMITTED';
}

function focusNext(event: KeyboardEvent): void {
  const input = event.currentTarget as HTMLInputElement;
  const inputs = Array.from(input.closest('table')?.querySelectorAll<HTMLInputElement>('input[data-score-input]:not(:disabled)') ?? []);
  inputs[inputs.indexOf(input) + 1]?.focus();
}

async function save(): Promise<void> {
  const h = props.homework;
  if (!h || hasProblem.value) return;
  const records: HomeworkRecordInput[] = rows.value.map((r) => ({
    enrollmentId: r.enrollmentId,
    status: r.status === '' ? null : r.status,
    score: r.score.trim() === '' || maxScore.value === null ? null : parseDecimal(r.score),
    remark: r.remark.trim() === '' ? null : r.remark.trim(),
  }));
  const saved = await submit.run(() => homeworkApi.saveRecords(h.id, records));
  if (!saved) return;
  adopt(saved);
  notify.success(t('homework.recordsSaved'));
  emit('saved');
}

const average = computed(() => (current.value ? classAverage(current.value) : null));
</script>

<template>
  <BModal v-model="open" :title="homework?.title ?? ''" size="xl" centered scrollable no-close-on-backdrop no-close-on-esc lazy unmount-lazy>
    <div v-if="current" class="homework-records-head" data-testid="homework-records-head">
      <span>{{ current.gradeName }} {{ current.className }}</span>
      <span>{{ subjectLabel(current) }}</span>
      <span>{{ t('homework.dueDate') }}: {{ formatDateKm(current.dueDate) }}</span>
      <span>{{ maxScore === null ? t('homework.noMarks') : t('exams.maxIs', { max: formatNumber(maxScore) }) }}</span>
    </div>
    <p v-if="closed" class="text-muted">{{ t('homework.yearClosed') }}</p>
    <FormAlert :message="submit.formError.value" />

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <p v-if="rows.length === 0" class="text-muted mb-0">{{ t('attendance.noStudents') }}</p>
      <template v-else>
        <p v-if="current" class="text-muted small" data-testid="homework-records-summary">
          {{ t('homework.handedInOf', { done: handedIn(current), total: current.studentCount }) }}
          <template v-if="maxScore !== null">· {{ t('homework.markedOf', { done: current.markedCount, total: current.studentCount }) }}<template v-if="average !== null"> · {{ t('homework.averageIs', { percent: formatNumber(average) }) }}</template></template>
          <template v-if="notRecordedCount(current) > 0">· {{ t('homework.notRecordedCount', { count: notRecordedCount(current) }) }}</template>
        </p>
        <div class="table-responsive scroll-x">
          <table class="table table-hover align-middle mb-3" data-testid="homework-records-table">
            <thead>
              <tr>
                <th>{{ t('students.code') }}</th>
                <th>{{ t('students.nameKm') }}</th>
                <th>{{ t('homework.recordStatus') }}</th>
                <th v-if="maxScore !== null">{{ t('exams.score') }}</th>
                <th>{{ t('homework.remark') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.enrollmentId" :data-student="row.studentCode">
                <td class="text-nowrap">{{ row.studentCode }}</td>
                <td class="fw-medium">{{ row.nameKm }}</td>
                <td>
                  <select v-model="row.status" class="form-select form-select-sm homework-status-select" :disabled="closed" :aria-label="`${t('homework.recordStatus')} ${row.nameKm}`" data-record-status @change="onStatus(row)">
                    <option value="">{{ t('homework.notRecorded') }}</option>
                    <option v-for="s in HOMEWORK_RECORD_STATUSES" :key="s" :value="s">{{ t(`homework.record.${s}`) }}</option>
                  </select>
                </td>
                <td v-if="maxScore !== null">
                  <input
                    v-model="row.score"
                    class="form-control form-control-sm score-input"
                    :class="{ 'is-invalid': problemOf(row) }"
                    inputmode="decimal"
                    autocomplete="off"
                    data-score-input
                    :disabled="closed || !canHaveMark(row.status) && row.status !== ''"
                    :aria-label="`${t('exams.score')} ${row.nameKm}`"
                    @input="onScore(row)"
                    @keydown.enter.prevent="focusNext"
                  />
                  <div v-if="problemOf(row)" class="field-error mt-1" role="alert">{{ validationText(problemOf(row) ?? undefined) }}</div>
                </td>
                <td>
                  <input v-model="row.remark" class="form-control form-control-sm" maxlength="500" autocomplete="off" data-record-remark :disabled="closed" :aria-label="`${t('homework.remark')} ${row.nameKm}`" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="form-text mb-0">{{ t('homework.recordsHelp') }}</p>
      </template>
    </StateBlock>

    <template #footer>
      <span v-if="dirty" class="text-muted me-auto">{{ t('attendance.unsaved') }}</span>
      <button v-if="dirty" type="button" class="btn btn-outline-secondary" :disabled="submit.submitting.value" @click="load">{{ t('exams.discardChanges') }}</button>
      <button type="button" class="btn btn-outline-secondary" data-testid="homework-records-close" @click="open = false">{{ t('common.close') }}</button>
      <LoadingButton icon="check-lg" :loading="submit.submitting.value" :disabled="closed || hasProblem || !dirty" data-testid="homework-records-save" @click="save">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
