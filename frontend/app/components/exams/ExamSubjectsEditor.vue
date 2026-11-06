<script setup lang="ts">
import { positiveAmountProblem } from '~/schemas/exam';
import { examsApi } from '~/services/examsApi';
import type { Examination, ExamSubject, ExamSubSubject, Grade, Subject } from '~/types/api';
import { formatNumber, parseDecimal } from '~/utils/score';
import { compareKhmer, sortByKhmer } from '~/utils/sort';

// The subjects of an examination for one grade at a time: the maximum score and the weight each MAIN subject counts with. A main subject that has
// sub-subjects is the sum of them: its maximum is theirs added together (read-only) and the scores are typed on the sub-subjects. Every subject the grade
// studies starts at a maximum of 100 and a weight of 1 (a placeholder: the school's real maxima replace it). The examination keeps its own copy of this
// structure; from the first score on, no subject or sub-subject can be added or removed (a maximum or a weight can still be corrected).
const props = defineProps<{ exam: Examination; subjects: ExamSubject[]; grades: Grade[]; catalog: Subject[]; closed: boolean }>();
const emit = defineEmits<{ changed: [] }>();

interface SubLine {
  row: ExamSubSubject;
  max: string;
  show: boolean;
}
interface Line {
  row: ExamSubject;
  max: string;
  weight: string;
  /** Problems are shown once Save was tried, not while the teacher is still typing. */
  show: boolean;
  subs: SubLine[];
}

const { t } = useI18n();
const notify = useNotify();
const { failureText, validationText } = useApiError();

const orderedGrades = computed(() => [...props.grades].sort((a, b) => a.level - b.level));
const gradeId = ref<number | null>(null);
const lines = ref<Line[]>([]);
/** "m<row id>" or "s<row id>": the two kinds of row have their own ids. */
const busy = ref<string | null>(null);
const removing = ref<{ kind: 'main' | 'sub'; id: number; name: string } | null>(null);
const confirmOpen = computed({
  get: () => removing.value !== null,
  set: (open) => {
    if (!open) removing.value = null;
  },
});

const addSubjectId = ref('');
const addMax = ref('100');
const addWeight = ref('1');
const showAddProblems = ref(false);
const adding = ref(false);

const addSubSubjectId = ref('');
const addSubMax = ref('100');
const showAddSubProblems = ref(false);
const addingSub = ref(false);

const frozen = computed(() => props.exam.frozen);
const gradeLines = computed(() => lines.value.filter((l) => l.row.gradeId === gradeId.value));
const anySubs = computed(() => gradeLines.value.some((l) => l.subs.length > 0));
/** Main subjects (active, not in this grade's list yet) that can be added. */
const addable = computed(() =>
  sortByKhmer(
    props.catalog.filter((s) => s.active && s.parentId === null && !gradeLines.value.some((l) => l.row.subjectId === s.id)),
    (s) => s.nameKm,
  ),
);
/** Sub-subjects (active) whose main subject is in this grade's list and that are not under it yet, labelled with their main subject. */
const addableSubs = computed(() => {
  const mains = new Map(gradeLines.value.map((l) => [l.row.subjectId, l]));
  return props.catalog
    .filter((s) => s.active && s.parentId !== null && mains.has(s.parentId) && !mains.get(s.parentId)?.subs.some((x) => x.row.subjectId === s.id))
    .map((s) => ({ id: s.id, label: `${mains.get(s.parentId as number)?.row.subjectName ?? ''} › ${s.nameKm}` }))
    .sort((a, b) => compareKhmer(a.label, b.label));
});

watch(
  () => props.grades,
  () => {
    if (gradeId.value === null || !props.grades.some((g) => g.id === gradeId.value)) gradeId.value = orderedGrades.value[0]?.id ?? null;
  },
  { immediate: true },
);

watch(
  () => props.subjects,
  (list) => {
    lines.value = list.map((row) => ({
      row,
      max: formatNumber(row.maxScore),
      weight: formatNumber(row.weight),
      show: false,
      subs: row.subSubjects.map((sub) => ({ row: sub, max: formatNumber(sub.maxScore), show: false })),
    }));
  },
  { immediate: true },
);

const derived = (line: Line): boolean => line.row.scoreSource === 'SUB_SUBJECTS';
const problemOf = (line: Line, field: 'max' | 'weight'): string | null => (field === 'max' && derived(line) ? null : positiveAmountProblem(line[field]));
const changed = (line: Line): boolean => (derived(line) ? false : parseDecimal(line.max) !== line.row.maxScore) || parseDecimal(line.weight) !== line.row.weight;
const subChanged = (sub: SubLine): boolean => parseDecimal(sub.max) !== sub.row.maxScore;

async function save(line: Line): Promise<void> {
  line.show = true;
  if (problemOf(line, 'max') || problemOf(line, 'weight')) return;
  busy.value = `m${line.row.id}`;
  try {
    // a main subject made of sub-subjects sends its own (derived) maximum back unchanged: only its weight is typed
    await examsApi.updateSubject(props.exam.id, line.row.id, { maxScore: derived(line) ? line.row.maxScore : parseDecimal(line.max), weight: parseDecimal(line.weight) });
    notify.success(t('exams.subjectSaved'));
    emit('changed');
  } catch (raised) {
    notify.error(failureText(raised));
  } finally {
    busy.value = null;
  }
}

async function saveSub(sub: SubLine): Promise<void> {
  sub.show = true;
  if (positiveAmountProblem(sub.max)) return;
  busy.value = `s${sub.row.id}`;
  try {
    await examsApi.updateSubSubject(props.exam.id, sub.row.id, { maxScore: parseDecimal(sub.max) });
    notify.success(t('exams.subjectSaved'));
    emit('changed');
  } catch (raised) {
    notify.error(failureText(raised));
  } finally {
    busy.value = null;
  }
}

async function removeConfirmed(): Promise<void> {
  const target = removing.value;
  if (!target) return;
  busy.value = `${target.kind === 'main' ? 'm' : 's'}${target.id}`;
  try {
    if (target.kind === 'main') await examsApi.removeSubject(props.exam.id, target.id);
    else await examsApi.removeSubSubject(props.exam.id, target.id);
    notify.success(t(target.kind === 'main' ? 'exams.subjectRemoved' : 'exams.subSubjectRemoved'));
    emit('changed');
  } catch (raised) {
    notify.error(failureText(raised));
  } finally {
    removing.value = null;
    busy.value = null;
  }
}

async function add(): Promise<void> {
  showAddProblems.value = true;
  if (gradeId.value === null || addSubjectId.value === '' || positiveAmountProblem(addMax.value) || positiveAmountProblem(addWeight.value)) return;
  adding.value = true;
  try {
    await examsApi.addSubject(props.exam.id, { gradeId: gradeId.value, subjectId: Number(addSubjectId.value), maxScore: parseDecimal(addMax.value), weight: parseDecimal(addWeight.value) });
    notify.success(t('exams.subjectAdded'));
    addSubjectId.value = '';
    addMax.value = '100';
    addWeight.value = '1';
    showAddProblems.value = false;
    emit('changed');
  } catch (raised) {
    notify.error(failureText(raised));
  } finally {
    adding.value = false;
  }
}

async function addSub(): Promise<void> {
  showAddSubProblems.value = true;
  if (gradeId.value === null || addSubSubjectId.value === '' || positiveAmountProblem(addSubMax.value)) return;
  addingSub.value = true;
  try {
    await examsApi.addSubSubject(props.exam.id, { gradeId: gradeId.value, subjectId: Number(addSubSubjectId.value), maxScore: parseDecimal(addSubMax.value) });
    notify.success(t('exams.subSubjectAdded'));
    addSubSubjectId.value = '';
    addSubMax.value = '100';
    showAddSubProblems.value = false;
    emit('changed');
  } catch (raised) {
    notify.error(failureText(raised));
  } finally {
    addingSub.value = false;
  }
}
</script>

<template>
  <div>
    <p class="text-muted">{{ t('exams.subjectsHelp') }}</p>
    <p v-if="frozen" class="alert alert-info py-2" data-testid="exam-frozen">{{ t('exams.frozenNote') }}</p>
    <p v-else-if="anySubs" class="alert alert-warning py-2" data-testid="exam-sub-placeholder">{{ t('exams.subMaxNotConfirmed') }}</p>
    <div class="filter-bar">
      <div>
        <label for="subjects-grade" class="visually-hidden">{{ t('classes.grade') }}</label>
        <select id="subjects-grade" v-model="gradeId" class="form-select">
          <option v-for="g in orderedGrades" :key="g.id" :value="g.id">{{ g.nameKm }}</option>
        </select>
      </div>
    </div>

    <p v-if="gradeLines.length === 0" class="text-muted">{{ t('exams.noSubjects') }}</p>
    <div v-else class="table-responsive scroll-x mb-3">
      <table class="table align-middle mb-0">
        <thead>
          <tr>
            <th>{{ t('exams.subject') }}</th>
            <th>{{ t('exams.maxScore') }}</th>
            <th>{{ t('exams.weight') }}</th>
            <th class="text-end">{{ t('exams.scoresEntered') }}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="line in gradeLines" :key="line.row.id">
            <tr :data-subject="line.row.subjectName" :data-kind="derived(line) ? 'main-derived' : 'main'">
              <td class="fw-medium">{{ line.row.subjectName }}</td>
              <td>
                <input v-model="line.max" class="form-control form-control-sm score-input" :class="{ 'is-invalid': line.show && problemOf(line, 'max') }" inputmode="decimal" autocomplete="off" :disabled="closed || derived(line)" :title="derived(line) ? t('exams.derivedMax') : undefined" :aria-label="t('exams.maxScore')" />
                <div v-if="line.show && problemOf(line, 'max')" class="field-error mt-1" role="alert">{{ validationText(problemOf(line, 'max') ?? undefined) }}</div>
              </td>
              <td>
                <input v-model="line.weight" class="form-control form-control-sm score-input" :class="{ 'is-invalid': line.show && problemOf(line, 'weight') }" inputmode="decimal" autocomplete="off" :disabled="closed" :aria-label="t('exams.weight')" />
                <div v-if="line.show && problemOf(line, 'weight')" class="field-error mt-1" role="alert">{{ validationText(problemOf(line, 'weight') ?? undefined) }}</div>
              </td>
              <td class="text-end">{{ line.row.scoreCount }}</td>
              <td class="text-end text-nowrap">
                <LoadingButton size="sm" icon="check-lg" :loading="busy === `m${line.row.id}`" :disabled="closed || busy !== null || !changed(line)" @click="save(line)">{{ t('common.save') }}</LoadingButton>
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm ms-1"
                  :disabled="closed || busy !== null || line.row.scoreCount > 0 || frozen"
                  :title="line.row.scoreCount > 0 ? t('exams.cannotRemove') : frozen ? t('exams.frozenCannotChange') : t('common.remove')"
                  :aria-label="t('common.remove')"
                  @click="removing = { kind: 'main', id: line.row.id, name: line.row.subjectName }"
                >
                  <AppIcon name="trash" />
                </button>
              </td>
            </tr>
            <tr v-for="sub in line.subs" :key="`s${sub.row.id}`" class="table-light" :data-subject="sub.row.subjectName" data-kind="sub" :data-parent="line.row.subjectName">
              <td class="ps-4"><span class="text-muted me-1" aria-hidden="true">↳</span>{{ sub.row.subjectName }}</td>
              <td>
                <input v-model="sub.max" class="form-control form-control-sm score-input" :class="{ 'is-invalid': sub.show && positiveAmountProblem(sub.max) }" inputmode="decimal" autocomplete="off" :disabled="closed" :aria-label="t('exams.maxScore')" />
                <div v-if="sub.show && positiveAmountProblem(sub.max)" class="field-error mt-1" role="alert">{{ validationText(positiveAmountProblem(sub.max) ?? undefined) }}</div>
              </td>
              <td class="text-muted">—</td>
              <td class="text-end">{{ sub.row.scoreCount }}</td>
              <td class="text-end text-nowrap">
                <LoadingButton size="sm" icon="check-lg" :loading="busy === `s${sub.row.id}`" :disabled="closed || busy !== null || !subChanged(sub)" @click="saveSub(sub)">{{ t('common.save') }}</LoadingButton>
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm ms-1"
                  :disabled="closed || busy !== null || sub.row.scoreCount > 0 || frozen"
                  :title="sub.row.scoreCount > 0 ? t('exams.cannotRemove') : frozen ? t('exams.frozenCannotChange') : t('common.remove')"
                  :aria-label="t('common.remove')"
                  @click="removing = { kind: 'sub', id: sub.row.id, name: sub.row.subjectName }"
                >
                  <AppIcon name="trash" />
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <h2 class="h6 form-section">{{ t('exams.addSubject') }}</h2>
    <div class="row g-2 align-items-start">
      <div class="col-md-5">
        <label for="add-subject" class="form-label">{{ t('exams.subject') }}</label>
        <select id="add-subject" v-model="addSubjectId" class="form-select" :class="{ 'is-invalid': showAddProblems && addSubjectId === '' }" :disabled="closed || frozen || addable.length === 0">
          <option value="">{{ addable.length === 0 ? t('exams.allSubjectsAdded') : t('common.choose') }}</option>
          <option v-for="s in addable" :key="s.id" :value="String(s.id)">{{ s.nameKm }}</option>
        </select>
      </div>
      <div class="col-md-2">
        <label for="add-max" class="form-label">{{ t('exams.maxScore') }}</label>
        <input id="add-max" v-model="addMax" class="form-control" :class="{ 'is-invalid': showAddProblems && positiveAmountProblem(addMax) }" inputmode="decimal" autocomplete="off" :disabled="closed || frozen" />
      </div>
      <div class="col-md-2">
        <label for="add-weight" class="form-label">{{ t('exams.weight') }}</label>
        <input id="add-weight" v-model="addWeight" class="form-control" :class="{ 'is-invalid': showAddProblems && positiveAmountProblem(addWeight) }" inputmode="decimal" autocomplete="off" :disabled="closed || frozen" />
      </div>
      <div class="col-md-3 pt-md-4">
        <LoadingButton variant="outline-primary" icon="plus-lg" :loading="adding" :disabled="closed || frozen || addable.length === 0" @click="add">{{ t('exams.addSubject') }}</LoadingButton>
      </div>
    </div>

    <h2 class="h6 form-section mt-4">{{ t('exams.addSubSubject') }}</h2>
    <p class="text-muted small">{{ t('exams.addSubSubjectHelp') }}</p>
    <div class="row g-2 align-items-start">
      <div class="col-md-5">
        <label for="add-sub-subject" class="form-label">{{ t('exams.subSubject') }}</label>
        <select id="add-sub-subject" v-model="addSubSubjectId" class="form-select" :class="{ 'is-invalid': showAddSubProblems && addSubSubjectId === '' }" :disabled="closed || frozen || addableSubs.length === 0">
          <option value="">{{ addableSubs.length === 0 ? t('exams.allSubSubjectsAdded') : t('common.choose') }}</option>
          <option v-for="s in addableSubs" :key="s.id" :value="String(s.id)">{{ s.label }}</option>
        </select>
      </div>
      <div class="col-md-2">
        <label for="add-sub-max" class="form-label">{{ t('exams.maxScore') }}</label>
        <input id="add-sub-max" v-model="addSubMax" class="form-control" :class="{ 'is-invalid': showAddSubProblems && positiveAmountProblem(addSubMax) }" inputmode="decimal" autocomplete="off" :disabled="closed || frozen" />
      </div>
      <div class="col-md-3 pt-md-4">
        <LoadingButton variant="outline-primary" icon="plus-lg" :loading="addingSub" :disabled="closed || frozen || addableSubs.length === 0" @click="addSub">{{ t('exams.addSubSubject') }}</LoadingButton>
      </div>
    </div>

    <ConfirmModal
      v-model="confirmOpen"
      :title="t('exams.removeSubjectTitle')"
      :message="t('exams.removeSubjectMessage', { subject: removing?.name ?? '' })"
      :confirm-label="t('common.remove')"
      :loading="busy !== null"
      @confirm="removeConfirmed"
    />
  </div>
</template>
