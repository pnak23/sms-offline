<script setup lang="ts">
import { type ReportName, useReportTable } from '~/composables/useReportTable';
import { academicApi } from '~/services/academicApi';
import { examsApi } from '~/services/examsApi';
import { homeworkApi } from '~/services/homeworkApi';
import { saveFile } from '~/services/desktop';
import { reportsApi } from '~/services/reportsApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { AttendanceBasis, Examination, Homework, Subject } from '~/types/api';
import { formatDateKm, monthStartIso, toIsoDate, todayIso } from '~/utils/date';
import { homeworkSubjectOptions, subjectLabel } from '~/utils/homework';
import { queryString } from '~/utils/query';

// Reports: pick one, choose what it is about, then preview and print it (A4, or save it as a PDF) or save it as an Excel file.
// Preview, print and Excel are the same table. Report cards, the student profile and attendance sheets have their own places.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const preferences = usePreferencesStore();
const { build } = useReportTable();

const { years, classes, yearId, classId, loading, error, load: loadPicker } = useClassPicker({ classOptional: true });
const exams = ref<Examination[]>([]);
const examId = ref<number | null>(null);
const name = ref<ReportName>('students');
const status = ref('');
const from = ref(monthStartIso());
const to = ref(todayIso());
const order = ref<'rank' | 'name'>('rank');
const basis = ref<AttendanceBasis>(preferences.attendanceBasis);   // counted the school's official way until another is picked here
watch(() => preferences.attendanceBasis, (official) => { basis.value = official; });   // the settings may arrive after this page opened
const exporting = ref(false);
// the homework reports (an independent module: never part of an examination): a subject to limit to, and, for the marks of one homework, which one
const subjects = ref<Subject[]>([]);
const subjectId = ref('');
const homeworkList = ref<Homework[]>([]);
const homeworkId = ref<number | null>(null);

const reports = computed<{ name: ReportName; needsClass: boolean }[]>(() => [
  { name: 'students', needsClass: false },
  { name: 'roster', needsClass: true },
  { name: 'attendance', needsClass: true },
  { name: 'results', needsClass: true },
  { name: 'teachers', needsClass: false },
  ...(preferences.feesEnabled ? [{ name: 'fees' as const, needsClass: true }] : []),
  { name: 'homework', needsClass: true },
  { name: 'homeworkMarks', needsClass: true },
  { name: 'homeworkSummary', needsClass: true },
]);

const usesPeriod = computed(() => name.value === 'attendance' || name.value === 'homework' || name.value === 'homeworkSummary');
const usesSubject = computed(() => name.value === 'homework' || name.value === 'homeworkSummary');
const usesHomeworkPick = computed(() => name.value === 'homeworkMarks');
const subjectOptions = computed(() => homeworkSubjectOptions(subjects.value, null, true));
const homeworkOptions = computed(() => homeworkList.value.map((h) => ({ value: h.id, label: `${formatDateKm(h.dueDate)} · ${subjectLabel(h)} · ${h.title}` })));

const usesClass = computed(() => name.value !== 'teachers');
const classRequired = computed(() => reports.value.find((r) => r.name === name.value)?.needsClass ?? false);
const usesStatus = computed(() => name.value === 'students' || name.value === 'teachers');
const periodOk = computed(() => toIsoDate(from.value) !== null && toIsoDate(to.value) !== null && from.value <= to.value);
const ready = computed(() => {
  if (classRequired.value && classId.value === null) return false;
  if (usesPeriod.value && !periodOk.value) return false;
  if (name.value === 'results' && examId.value === null) return false;
  if (usesHomeworkPick.value && homeworkId.value === null) return false;
  return true;
});

const params = computed(() => ({
  name: name.value,
  yearId: yearId.value,
  classId: usesClass.value ? classId.value : null,
  examId: name.value === 'results' ? examId.value : null,
  from: usesPeriod.value ? from.value : undefined,
  to: usesPeriod.value ? to.value : undefined,
  homeworkId: usesHomeworkPick.value ? homeworkId.value : null,
  subjectId: usesSubject.value && subjectId.value ? Number(subjectId.value) : null,
  basis: name.value === 'attendance' ? basis.value : undefined,
  status: usesStatus.value ? status.value : undefined,
  order: name.value === 'results' ? order.value : undefined,
}));
const printLink = computed(() => `/print/report${queryString(params.value)}`);

async function loadExams(): Promise<void> {
  if (yearId.value === null) {
    exams.value = [];
    examId.value = null;
    return;
  }
  try {
    exams.value = await examsApi.list(yearId.value);
    if (!exams.value.some((e) => e.id === examId.value)) examId.value = exams.value[exams.value.length - 1]?.id ?? null;
  } catch (raised) {
    notify.error(messageFor(raised));
  }
}

async function loadHomework(): Promise<void> {
  if (!usesHomeworkPick.value || classId.value === null) {
    homeworkList.value = [];
    homeworkId.value = null;
    return;
  }
  try {
    homeworkList.value = await homeworkApi.list({ classId: classId.value });
    if (!homeworkList.value.some((h) => h.id === homeworkId.value)) homeworkId.value = homeworkList.value[homeworkList.value.length - 1]?.id ?? null;
  } catch (raised) {
    notify.error(messageFor(raised));
  }
}

async function load(): Promise<void> {
  await loadPicker();
  await loadExams();
  try {
    subjects.value = await academicApi.subjects();
  } catch (raised) {
    notify.error(messageFor(raised));
  }
  await loadHomework();
}

async function exportExcel(): Promise<void> {
  exporting.value = true;
  try {
    const table = await build(name.value, { ...params.value, from: from.value, to: to.value });
    const result = await saveFile(`${table.sheetName}.xlsx`, await reportsApi.exportTable(table));
    if (result.saved) notify.success(t('students.exported'));
  } catch (raised) {
    notify.error(messageFor(raised));
  } finally {
    exporting.value = false;
  }
}

watch(yearId, loadExams);
watch(name, () => {
  status.value = '';
  subjectId.value = '';
});
watch([name, classId], loadHomework);
// A report that needs a class starts with the first one chosen (a list that may be "all classes" starts empty).
watch([name, classes], () => {
  if (classRequired.value && classId.value === null) classId.value = classes.value[0]?.id ?? null;
});
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('reports.title')" :subtitle="t('reports.subtitle')" />

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="loading" :error="error" @retry="load">
          <div class="row g-3">
            <div class="col-lg-4">
              <div class="list-group" role="radiogroup" :aria-label="t('reports.choose')">
                <template v-for="r in reports" :key="r.name">
                  <div v-if="r.name === 'homework'" class="px-1 pt-3 pb-1 small fw-semibold text-muted" data-testid="report-group-homework">{{ t('reports.homeworkGroup') }}</div>
                  <label class="list-group-item list-group-item-action report-choice" :class="{ active: name === r.name }">
                    <input v-model="name" type="radio" class="visually-hidden" name="report" :value="r.name" :data-report="r.name" />
                    <span class="fw-medium">{{ t(`reports.${r.name}.title`) }}</span>
                    <span class="d-block small report-choice-hint">{{ t(`reports.${r.name}.hint`) }}</span>
                  </label>
                </template>
              </div>
              <p class="text-muted small mt-3 mb-0">
                {{ t('reports.elsewhere') }}
                <NuxtLink to="/report-cards">{{ t('nav.reportCards') }}</NuxtLink>
              </p>
            </div>

            <div class="col-lg-8">
              <h2 class="h5">{{ t(`reports.${name}.title`) }}</h2>
              <div class="filter-bar">
                <template v-if="usesClass">
                  <ClassPicker v-model:year-id="yearId" v-model:class-id="classId" :years="years" :classes="classes" :allow-all="!classRequired" />
                </template>
                <div v-if="name === 'results'">
                  <label for="report-exam" class="visually-hidden">{{ t('reportCards.examination') }}</label>
                  <select id="report-exam" v-model="examId" class="form-select">
                    <option v-if="exams.length === 0" :value="null">{{ t('reportCards.noExams') }}</option>
                    <option v-for="e in exams" :key="e.id" :value="e.id">{{ e.nameKm }}</option>
                  </select>
                </div>
                <div v-if="name === 'results'">
                  <label for="report-order" class="visually-hidden">{{ t('reports.results.order') }}</label>
                  <select id="report-order" v-model="order" class="form-select">
                    <option value="rank">{{ t('reports.results.byRank') }}</option>
                    <option value="name">{{ t('reports.results.byName') }}</option>
                  </select>
                </div>
                <div v-if="usesSubject">
                  <label for="report-subject" class="visually-hidden">{{ t('exams.subject') }}</label>
                  <select id="report-subject" v-model="subjectId" class="form-select" data-testid="report-subject">
                    <option value="">{{ t('homework.allSubjects') }}</option>
                    <option v-for="o in subjectOptions" :key="o.value" :value="String(o.value)">{{ o.label }}</option>
                  </select>
                </div>
                <div v-if="usesHomeworkPick">
                  <label for="report-homework" class="visually-hidden">{{ t('reports.homeworkMarks.pick') }}</label>
                  <select id="report-homework" v-model="homeworkId" class="form-select" data-testid="report-homework">
                    <option v-if="homeworkOptions.length === 0" :value="null">{{ t('homework.empty') }}</option>
                    <option v-for="o in homeworkOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                </div>
                <template v-if="usesPeriod">
                  <div>
                    <label for="report-from" class="visually-hidden">{{ t('attendance.from') }}</label>
                    <input id="report-from" v-model="from" type="date" class="form-control" :max="to" />
                  </div>
                  <span aria-hidden="true">→</span>
                  <div>
                    <label for="report-to" class="visually-hidden">{{ t('attendance.to') }}</label>
                    <input id="report-to" v-model="to" type="date" class="form-control" :min="from" />
                  </div>
                  <div v-if="name === 'attendance'">
                    <label for="report-basis" class="visually-hidden">{{ t('attendance.basis.label') }}</label>
                    <select id="report-basis" v-model="basis" class="form-select" data-testid="report-basis">
                      <option value="DAY">{{ t('attendance.basis.DAY') }}{{ preferences.attendanceBasis === 'DAY' ? ` (${t('attendance.basis.official')})` : '' }}</option>
                      <option value="SESSION">{{ t('attendance.basis.SESSION') }}{{ preferences.attendanceBasis === 'SESSION' ? ` (${t('attendance.basis.official')})` : '' }}</option>
                    </select>
                  </div>
                </template>
                <div v-if="usesStatus">
                  <label for="report-status" class="visually-hidden">{{ t('common.status') }}</label>
                  <select id="report-status" v-model="status" class="form-select">
                    <option value="">{{ t('reports.anyStatus') }}</option>
                    <option v-if="name === 'students'" value="ACTIVE">{{ t('studentStatus.ACTIVE') }}</option>
                    <option v-if="name === 'students'" value="INACTIVE">{{ t('studentStatus.INACTIVE') }}</option>
                    <option v-if="name === 'students'" value="GRADUATED">{{ t('studentStatus.GRADUATED') }}</option>
                    <option v-if="name === 'teachers'" value="ACTIVE">{{ t('teacherStatus.ACTIVE') }}</option>
                    <option v-if="name === 'teachers'" value="INACTIVE">{{ t('teacherStatus.INACTIVE') }}</option>
                  </select>
                </div>
              </div>
              <p v-if="usesPeriod && !periodOk" class="text-danger">{{ t('attendance.badRange') }}</p>
              <p v-else-if="!ready" class="text-muted">{{ t('reports.needChoice') }}</p>

              <div class="d-flex flex-wrap gap-2 mt-3">
                <NuxtLink :to="ready ? printLink : ''" class="btn btn-primary" :class="{ disabled: !ready }" :aria-disabled="!ready" data-testid="report-preview"><AppIcon name="printer" />{{ t('reports.preview') }}</NuxtLink>
                <LoadingButton variant="outline-primary" icon="file-earmark-excel" :loading="exporting" :disabled="!ready" @click="exportExcel">{{ t('reports.excel') }}</LoadingButton>
              </div>
            </div>
          </div>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
