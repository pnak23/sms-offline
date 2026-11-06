<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import { examsApi } from '~/services/examsApi';
import type { ClassDto, Examination, ExamSubject, Grade, Subject } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { compareKhmer } from '~/utils/sort';

// One examination: the subjects (maximum and weight per grade), the scores by class and subject, and the results with ranks.
const { t } = useI18n();
const route = useRoute();
const { messageFor } = useApiError();
const notify = useNotify();
const { examKindLabel } = useLabels();

const id = Number(route.params.id);
const exam = ref<Examination | null>(null);
const subjects = ref<ExamSubject[]>([]);
const grades = ref<Grade[]>([]);
const catalog = ref<Subject[]>([]);
const classes = ref<ClassDto[]>([]);
const closed = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);
const tab = ref<'subjects' | 'scores' | 'results'>('scores');
const refreshKey = ref(0);
const showForm = ref(false);
const confirmDelete = ref(false);
const deleting = ref(false);

const subtitle = computed(() => {
  const e = exam.value;
  if (!e) return undefined;
  const parts = [e.yearName, examKindLabel(e.kind)];
  if (e.termNo !== null) parts.push(t('exams.termShort', { term: e.termNo }));
  if (e.startDate) parts.push(`${formatDateKm(e.startDate)}${e.endDate ? ` → ${formatDateKm(e.endDate)}` : ''}`);
  return parts.join(' · ');
});

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const [found, rows, allGrades, allSubjects, years] = await Promise.all([examsApi.get(id), examsApi.subjects(id), academicApi.grades(), academicApi.subjects(), academicApi.years()]);
    const list = await classesApi.list({ yearId: found.academicYearId });
    exam.value = found;
    subjects.value = rows;
    grades.value = allGrades;
    catalog.value = allSubjects;
    classes.value = [...list].sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));
    closed.value = years.find((y) => y.id === found.academicYearId)?.status === 'CLOSED';
    refreshKey.value += 1;
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

/** After scores or subjects changed: the counts and the results move, the rest of the page stays as it is. */
async function refresh(): Promise<void> {
  try {
    [exam.value, subjects.value] = await Promise.all([examsApi.get(id), examsApi.subjects(id)]);
    refreshKey.value += 1;
  } catch (error) {
    notify.error(messageFor(error));
  }
}

async function remove(): Promise<void> {
  deleting.value = true;
  try {
    await examsApi.remove(id);
    notify.success(t('exams.deleted'));
    await navigateTo('/exams');
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    deleting.value = false;
    confirmDelete.value = false;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="exam?.nameKm ?? t('exams.title')" :subtitle="subtitle">
      <NuxtLink to="/exams" class="btn btn-outline-secondary"><AppIcon name="arrow-left" />{{ t('common.back') }}</NuxtLink>
      <NuxtLink v-if="exam" :to="`/report-cards?examinationId=${exam.id}`" class="btn btn-outline-primary"><AppIcon name="file-earmark-text" />{{ t('exams.reportCards') }}</NuxtLink>
      <template v-if="exam && !closed">
        <button type="button" class="btn btn-outline-secondary" @click="showForm = true"><AppIcon name="pencil" />{{ t('common.edit') }}</button>
        <button type="button" class="btn btn-outline-danger" @click="confirmDelete = true"><AppIcon name="trash" />{{ t('common.delete') }}</button>
      </template>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <div v-if="exam" class="card">
        <div class="card-body">
          <ul class="nav nav-tabs mb-3" role="tablist">
            <li class="nav-item" role="presentation">
              <button id="exam-tab-scores" type="button" class="nav-link" :class="{ active: tab === 'scores' }" role="tab" :aria-selected="tab === 'scores'" @click="tab = 'scores'">{{ t('exams.tabScores') }}</button>
            </li>
            <li class="nav-item" role="presentation">
              <button id="exam-tab-results" type="button" class="nav-link" :class="{ active: tab === 'results' }" role="tab" :aria-selected="tab === 'results'" @click="tab = 'results'">{{ t('exams.tabResults') }}</button>
            </li>
            <li class="nav-item" role="presentation">
              <button id="exam-tab-subjects" type="button" class="nav-link" :class="{ active: tab === 'subjects' }" role="tab" :aria-selected="tab === 'subjects'" @click="tab = 'subjects'">{{ t('exams.tabSubjects') }}</button>
            </li>
          </ul>

          <!-- kept mounted (only hidden) so scores that are not saved yet survive a look at another tab -->
          <ScoreEntry v-show="tab === 'scores'" :exam="exam" :subjects="subjects" :classes="classes" :closed="closed" @saved="refresh" />
          <ExamResults v-if="tab === 'results'" :exam="exam" :classes="classes" :refresh-key="refreshKey" />
          <ExamSubjectsEditor v-if="tab === 'subjects'" :exam="exam" :subjects="subjects" :grades="grades" :catalog="catalog" :closed="closed" @changed="refresh" />
        </div>
      </div>
    </StateBlock>

    <ExamFormModal v-model="showForm" :exam="exam" :year-id="exam?.academicYearId ?? null" :year-name="exam?.yearName ?? ''" @saved="load" @stale="load" />
    <ConfirmModal v-model="confirmDelete" :title="t('exams.deleteTitle')" :message="t('exams.deleteMessage', { name: exam?.nameKm ?? '' })" :confirm-label="t('common.delete')" :loading="deleting" @confirm="remove" />
  </div>
</template>
