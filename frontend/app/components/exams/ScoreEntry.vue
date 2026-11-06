<script setup lang="ts">
import { examsApi } from '~/services/examsApi';
import type { ClassDto, ExamSubject, Examination, ScoreEntry, ScoreSheet } from '~/types/api';
import { formatNumber, parseDecimal } from '~/utils/score';
import { sortByKhmer } from '~/utils/sort';

// Enter the scores of one subject for one class: type each score (Enter moves down), tick "absent" for a student who missed it.
// A main subject made of sub-subjects is not typed: its sub-subjects are listed under it and their scores add up to it.
// An empty box means "not entered yet", which is not the same as 0. The class and subject cannot be changed while there are unsaved scores.
const props = defineProps<{ exam: Examination; subjects: ExamSubject[]; classes: ClassDto[]; closed: boolean }>();
const emit = defineEmits<{ saved: [] }>();

interface RowState {
  enrollmentId: number;
  studentCode: string;
  nameKm: string;
  score: string;
  absent: boolean;
  remark: string | null;
}

const { t } = useI18n();
const notify = useNotify();
const { messageFor, validationText } = useApiError();
const submit = useSubmit({ fields: [] });

const classId = ref<number | null>(null);
const subjectId = ref<number | null>(null);
const rows = ref<RowState[]>([]);
const sheetMax = ref(0);
const loading = ref(false);
const loadError = ref<string | null>(null);
let baseline = '';

const schoolClass = computed(() => props.classes.find((c) => c.id === classId.value) ?? null);
/** What can be typed for the class's grade: a main subject typed directly, or one sub-subject of a main subject made of them (listed under it). */
interface Unit {
  subjectId: number;
  label: string;
  group: string | null;
  maxScore: number;
}
const units = computed<Unit[]>(() => {
  const gradeId = schoolClass.value?.gradeId;
  const seen = new Set<number>();
  const out: Unit[] = [];
  for (const s of props.subjects) {
    if (s.gradeId !== gradeId || seen.has(s.subjectId)) continue;
    seen.add(s.subjectId);
    if (s.scoreSource === 'SUB_SUBJECTS' && s.subSubjects.length > 0) {
      for (const sub of s.subSubjects) out.push({ subjectId: sub.subjectId, label: sub.subjectName, group: s.subjectName, maxScore: sub.maxScore });
    } else {
      out.push({ subjectId: s.subjectId, label: s.subjectName, group: null, maxScore: s.maxScore });
    }
  }
  return out;
});
/** The same, as the select shows it: a direct subject on its own, the sub-subjects of one main subject together under a heading. */
const entries = computed(() => {
  const out: { group: string | null; units: Unit[] }[] = [];
  for (const u of units.value) {
    const last = out[out.length - 1];
    if (u.group !== null && last?.group === u.group) last.units.push(u);
    else out.push({ group: u.group, units: [u] });
  }
  return out;
});

// The maximum comes from the examination's subject list, which is refreshed whenever the Subjects tab changes it; the sheet loaded
// earlier may still carry the old maximum (this component stays mounted while another tab is shown).
const maxScore = computed(() => units.value.find((u) => u.subjectId === subjectId.value)?.maxScore ?? sheetMax.value);

const snapshot = () => JSON.stringify(rows.value.map((r) => [r.enrollmentId, r.score.trim(), r.absent]));
const dirty = computed(() => rows.value.length > 0 && snapshot() !== baseline);

function problemOf(row: RowState): 'INVALID_NUMBER' | 'OUT_OF_RANGE' | null {
  const text = row.score.trim();
  if (row.absent || text === '') return null;
  const n = parseDecimal(text);
  if (Number.isNaN(n)) return 'INVALID_NUMBER';
  return n > maxScore.value ? 'OUT_OF_RANGE' : null;
}

const hasProblem = computed(() => rows.value.some((r) => problemOf(r) !== null));
const enteredCount = computed(() => rows.value.filter((r) => r.absent || r.score.trim() !== '').length);

function adopt(sheet: ScoreSheet): void {
  sheetMax.value = sheet.maxScore;
  rows.value = sortByKhmer(sheet.rows, (r) => r.nameKm).map((r) => ({ enrollmentId: r.enrollmentId, studentCode: r.studentCode, nameKm: r.nameKm, score: formatNumber(r.score), absent: r.absent, remark: r.remark }));
  baseline = snapshot();
}

async function load(): Promise<void> {
  rows.value = [];
  baseline = snapshot();
  loadError.value = null;
  submit.clearError();
  if (classId.value === null || subjectId.value === null) return;
  const target = { classId: classId.value, subjectId: subjectId.value };
  loading.value = true;
  try {
    const sheet = await examsApi.scoreSheet(props.exam.id, target.classId, target.subjectId);
    if (classId.value === target.classId && subjectId.value === target.subjectId) adopt(sheet);
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.classes,
  (list) => {
    if (classId.value === null || !list.some((c) => c.id === classId.value)) classId.value = list[0]?.id ?? null;
  },
  { immediate: true },
);

watch(
  units,
  (list) => {
    if (subjectId.value === null || !list.some((u) => u.subjectId === subjectId.value)) subjectId.value = list[0]?.subjectId ?? null;
  },
  { immediate: true },
);

watch([classId, subjectId], load, { immediate: true });

function setAbsent(row: RowState): void {
  if (row.absent) row.score = '';
}

function focusNext(event: KeyboardEvent): void {
  const current = event.currentTarget as HTMLInputElement;
  const inputs = Array.from(current.closest('table')?.querySelectorAll<HTMLInputElement>('input[data-score-input]:not(:disabled)') ?? []);
  inputs[inputs.indexOf(current) + 1]?.focus();
}

async function save(): Promise<void> {
  if (classId.value === null || subjectId.value === null || hasProblem.value) return;
  const entries: ScoreEntry[] = rows.value.map((r) => ({
    enrollmentId: r.enrollmentId,
    score: r.absent || r.score.trim() === '' ? null : parseDecimal(r.score),
    absent: r.absent,
    remark: r.remark,
  }));
  const saved = await submit.run(() => examsApi.saveScores(props.exam.id, classId.value as number, subjectId.value as number, entries));
  if (!saved) return;
  adopt(saved);
  notify.success(t('exams.scoresSaved'));
  emit('saved');
}
</script>

<template>
  <div>
    <div class="filter-bar">
      <div>
        <label for="score-class" class="visually-hidden">{{ t('classes.title') }}</label>
        <select id="score-class" v-model="classId" class="form-select" :disabled="dirty">
          <option v-if="classes.length === 0" :value="null">{{ t('classes.noneInYear') }}</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.gradeName }} {{ c.nameKm }}</option>
        </select>
      </div>
      <div>
        <label for="score-subject" class="visually-hidden">{{ t('exams.subject') }}</label>
        <select id="score-subject" v-model="subjectId" class="form-select" :disabled="dirty">
          <option v-if="units.length === 0" :value="null">{{ t('exams.noSubjects') }}</option>
          <template v-for="(entry, i) in entries" :key="i">
            <option v-if="entry.group === null" :value="entry.units[0]?.subjectId">{{ entry.units[0]?.label }}</option>
            <optgroup v-else :label="entry.group">
              <option v-for="u in entry.units" :key="u.subjectId" :value="u.subjectId">{{ u.label }}</option>
            </optgroup>
          </template>
        </select>
      </div>
      <span v-if="rows.length > 0" class="text-muted">{{ t('exams.maxIs', { max: formatNumber(maxScore) }) }} · {{ t('exams.enteredOf', { done: enteredCount, total: rows.length }) }}</span>
    </div>

    <p v-if="closed" class="text-muted">{{ t('exams.yearClosed') }}</p>
    <FormAlert :message="submit.formError.value" />

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <p v-if="classId === null" class="text-muted mb-0">{{ t('attendance.chooseClass') }}</p>
      <p v-else-if="subjectId === null" class="text-muted mb-0">{{ t('exams.noSubjectsForGrade') }}</p>
      <p v-else-if="rows.length === 0" class="text-muted mb-0">{{ t('attendance.noStudents') }}</p>
      <template v-else>
        <div class="table-responsive scroll-x">
          <table class="table table-hover align-middle mb-3">
            <thead>
              <tr>
                <th>{{ t('students.code') }}</th>
                <th>{{ t('students.nameKm') }}</th>
                <th>{{ t('exams.score') }}</th>
                <th>{{ t('exams.absent') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.enrollmentId" :data-student="row.studentCode">
                <td class="text-nowrap">{{ row.studentCode }}</td>
                <td class="fw-medium">{{ row.nameKm }}</td>
                <td>
                  <input
                    v-model="row.score"
                    class="form-control form-control-sm score-input"
                    :class="{ 'is-invalid': problemOf(row) }"
                    inputmode="decimal"
                    autocomplete="off"
                    data-score-input
                    :disabled="closed || row.absent"
                    :aria-label="`${t('exams.score')} ${row.nameKm}`"
                    @keydown.enter.prevent="focusNext"
                  />
                  <div v-if="problemOf(row)" class="field-error mt-1" role="alert">{{ validationText(problemOf(row) ?? undefined) }}</div>
                </td>
                <td>
                  <div class="form-check mb-0">
                    <input :id="`absent-${row.enrollmentId}`" v-model="row.absent" type="checkbox" class="form-check-input" :disabled="closed" @change="setAbsent(row)" />
                    <label :for="`absent-${row.enrollmentId}`" class="form-check-label">{{ t('exams.absent') }}</label>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="form-text">{{ t('exams.absentHelp') }}</p>

        <LoadingButton icon="check-lg" :loading="submit.submitting.value" :disabled="closed || hasProblem || !dirty" @click="save">{{ t('common.save') }}</LoadingButton>
        <button v-if="dirty" type="button" class="btn btn-outline-secondary ms-2" :disabled="submit.submitting.value" @click="load">{{ t('exams.discardChanges') }}</button>
        <span v-if="dirty" class="text-muted ms-3">{{ t('attendance.unsaved') }}</span>
      </template>
    </StateBlock>
  </div>
</template>
