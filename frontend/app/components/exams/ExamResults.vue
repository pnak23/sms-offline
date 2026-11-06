<script setup lang="ts">
import { examsApi } from '~/services/examsApi';
import type { ClassDto, ExamResults, Examination, StudentResult } from '~/types/api';
import { formatNumber } from '~/utils/score';
import { sortByKhmer } from '~/utils/sort';

// The results of one class: each subject's score, the weighted total, the percentage, the grade band, pass or fail, and the rank.
// A student with a subject not entered yet has an incomplete result: no percentage, band, pass or rank until it is complete.
const props = defineProps<{ exam: Examination; classes: ClassDto[]; refreshKey: number }>();

const { t } = useI18n();
const { messageFor } = useApiError();

const classId = ref<number | null>(null);
const results = ref<ExamResults | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);

// Students in Khmer alphabetical order like every other list; the rank column carries the order of merit.
const students = computed(() => sortByKhmer(results.value?.students ?? [], (s) => s.nameKm));
const incompleteCount = computed(() => students.value.filter((s) => !s.complete).length);

async function load(): Promise<void> {
  results.value = null;
  loadError.value = null;
  if (classId.value === null) return;
  const target = classId.value;
  loading.value = true;
  try {
    const found = await examsApi.results(props.exam.id, target);
    if (classId.value === target) results.value = found;
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

function scoreOf(student: StudentResult, examSubjectId: number): string {
  const entry = student.scores.find((s) => s.examSubjectId === examSubjectId);
  if (!entry) return '—';
  if (entry.absent) return t('exams.absentShort');
  return entry.score === null ? '—' : formatNumber(entry.score);
}

watch(
  () => props.classes,
  (list) => {
    if (classId.value === null || !list.some((c) => c.id === classId.value)) classId.value = list[0]?.id ?? null;
  },
  { immediate: true },
);
watch([classId, () => props.refreshKey], load, { immediate: true });
</script>

<template>
  <div>
    <div class="filter-bar">
      <div>
        <label for="results-class" class="visually-hidden">{{ t('classes.title') }}</label>
        <select id="results-class" v-model="classId" class="form-select">
          <option v-if="classes.length === 0" :value="null">{{ t('classes.noneInYear') }}</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.gradeName }} {{ c.nameKm }}</option>
        </select>
      </div>
      <span v-if="results" class="text-muted">
        <span data-testid="results-scale">{{ t('exams.scaleIs', { name: results.scaleName }) }}</span> · {{ t('exams.passMarkIs', { percent: formatNumber(results.passPercent) }) }} · <NuxtLink to="/settings/grading">{{ t('nav.grading') }}</NuxtLink>
      </span>
    </div>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <p v-if="classId === null" class="text-muted mb-0">{{ t('attendance.chooseClass') }}</p>
      <p v-else-if="!results || results.students.length === 0" class="text-muted mb-0">{{ t('attendance.noStudents') }}</p>
      <p v-else-if="results.subjects.length === 0" class="text-muted mb-0">{{ t('exams.noSubjectsForGrade') }}</p>
      <template v-else>
        <p v-if="incompleteCount > 0" class="text-warning-emphasis" data-testid="results-incomplete">{{ t('exams.incompleteNote', { count: incompleteCount }) }}</p>
        <div class="table-responsive scroll-x">
          <table class="table table-hover align-middle mb-2" data-testid="results-table">
            <thead>
              <tr>
                <th class="text-end">{{ t('exams.rank') }}</th>
                <th>{{ t('students.nameKm') }}</th>
                <th v-for="s in results.subjects" :key="s.examSubjectId" class="text-end">
                  {{ s.subjectName }}<br /><span class="text-muted fw-normal small">/ {{ formatNumber(s.maxScore) }}</span>
                </th>
                <th class="text-end">{{ t('exams.total') }}</th>
                <th class="text-end">{{ t('exams.percent') }}</th>
                <th>{{ t('exams.band') }}</th>
                <th>{{ t('exams.outcome') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="student in students" :key="student.enrollmentId" :data-student="student.studentCode">
                <td class="text-end fw-semibold">{{ student.rank ?? '—' }}</td>
                <td class="fw-medium">{{ student.nameKm }}</td>
                <td v-for="s in results.subjects" :key="s.examSubjectId" class="text-end">{{ scoreOf(student, s.examSubjectId) }}</td>
                <td class="text-end text-nowrap">
                  {{ formatNumber(student.total) }} / {{ formatNumber(student.totalMax) }}<span v-if="student.absentCount > 0" :title="t('exams.absentAsZero')" class="text-danger"> *</span>
                </td>
                <td class="text-end">{{ student.percent === null ? '—' : formatNumber(student.percent) }}</td>
                <td class="text-nowrap">{{ student.bandLetter ? `${student.bandLetter} · ${student.bandLabel}` : '—' }}</td>
                <td>
                  <span v-if="!student.complete" class="badge text-bg-secondary">{{ t('exams.incomplete') }}</span>
                  <span v-else-if="student.passed" class="badge text-bg-success">{{ t('exams.passed') }}</span>
                  <span v-else class="badge text-bg-danger">{{ t('exams.failed') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="form-text">{{ t('exams.absentAsZero') }}</p>
      </template>
    </StateBlock>
  </div>
</template>
