<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { homeworkApi } from '~/services/homeworkApi';
import type { Homework, HomeworkStatus, Subject } from '~/types/api';
import { formatDateKm, todayIso } from '~/utils/date';
import { classAverage, handedIn, homeworkSubjectOptions, subjectLabel } from '~/utils/homework';
import { formatNumber } from '~/utils/score';

// Homework the teachers have recorded, soonest due first. Filter by class, subject and status; mark a record done or cancelled. Each homework opens its students' records
// (a submission status, and a mark when it has a maximum). Homework marks are never part of an examination.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const { homeworkStatusLabel, homeworkStatusOptions } = useLabels();

const { years, classes, yearId, classId, closed, loading: pickerLoading, error: pickerError, load: loadPicker } = useClassPicker({ classOptional: true });
const subjects = ref<Subject[]>([]);
const items = ref<Homework[]>([]);
const status = ref('');
const subjectFilter = ref('');
const loading = ref(false);
const loadError = ref<string | null>(null);
const editing = ref<Homework | null>(null);
const showForm = ref(false);
const recordsFor = ref<Homework | null>(null);
const showRecords = ref(false);
const busyId = ref<number | null>(null);

// With "all classes" the server answers for every year; the page shows the chosen year's classes only (what the form can edit).
const visibleItems = computed(() => {
  const ofYear = new Set(classes.value.map((c) => c.id));
  return items.value.filter((h) => ofYear.has(h.classId));
});

const subjectFilterOptions = computed(() => homeworkSubjectOptions(subjects.value, null, true));

const today = todayIso();
const STATUS_STYLE: Record<HomeworkStatus, string> = { ASSIGNED: 'primary', DONE: 'success', CANCELLED: 'secondary' };
const overdue = (h: Homework): boolean => h.status === 'ASSIGNED' && h.dueDate < today;

async function loadItems(): Promise<void> {
  loadError.value = null;
  loading.value = true;
  try {
    items.value = await homeworkApi.list({ classId: classId.value, status: status.value || undefined, subjectId: subjectFilter.value ? Number(subjectFilter.value) : null });
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

async function load(): Promise<void> {
  await loadPicker();
  try {
    subjects.value = await academicApi.subjects();
  } catch (raised) {
    loadError.value = messageFor(raised);
  }
  await loadItems();
}

function openForm(item: Homework | null): void {
  editing.value = item;
  showForm.value = true;
}

function openRecords(item: Homework): void {
  recordsFor.value = item;
  showRecords.value = true;
}

async function setStatus(item: Homework, next: HomeworkStatus): Promise<void> {
  busyId.value = item.id;
  try {
    await homeworkApi.setStatus(item.id, next, item.version);
    notify.success(t('homework.statusChanged'));
    await loadItems();
  } catch (raised) {
    notify.error(messageFor(raised));
    await loadItems();
  } finally {
    busyId.value = null;
  }
}

watch([classId, status, subjectFilter], loadItems);
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('homework.title')" :subtitle="t('homework.subtitle')">
      <button type="button" class="btn btn-primary" :disabled="classes.length === 0 || closed" @click="openForm(null)"><AppIcon name="plus-lg" />{{ t('homework.add') }}</button>
    </PageHeader>

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="pickerLoading" :error="pickerError" @retry="load">
          <p v-if="years.length === 0" class="mb-0">
            {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <div class="filter-bar">
              <ClassPicker v-model:year-id="yearId" v-model:class-id="classId" :years="years" :classes="classes" allow-all />
              <div>
                <label for="homework-status" class="visually-hidden">{{ t('common.status') }}</label>
                <select id="homework-status" v-model="status" class="form-select">
                  <option value="">{{ t('homework.allStatuses') }}</option>
                  <option v-for="o in homeworkStatusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div>
                <label for="homework-subject" class="visually-hidden">{{ t('exams.subject') }}</label>
                <select id="homework-subject" v-model="subjectFilter" class="form-select">
                  <option value="">{{ t('homework.allSubjects') }}</option>
                  <option v-for="o in subjectFilterOptions" :key="o.value" :value="String(o.value)">{{ o.label }}</option>
                </select>
              </div>
            </div>
            <p v-if="closed" class="text-muted">{{ t('homework.yearClosed') }}</p>

            <StateBlock :loading="loading" :error="loadError" @retry="loadItems">
              <p v-if="visibleItems.length === 0" class="text-muted mb-0">{{ t('homework.empty') }}</p>
              <div v-else class="table-responsive scroll-x">
                <table class="table table-hover align-middle mb-0" data-testid="homework-table">
                  <thead>
                    <tr>
                      <th>{{ t('homework.dueDate') }}</th>
                      <th>{{ t('homework.titleLabel') }}</th>
                      <th>{{ t('classes.title') }}</th>
                      <th>{{ t('exams.subject') }}</th>
                      <th>{{ t('common.status') }}</th>
                      <th>{{ t('homework.studentsColumn') }}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="h in visibleItems" :key="h.id" :data-homework="h.title">
                      <td class="text-nowrap" :class="{ 'text-danger fw-semibold': overdue(h) }">{{ formatDateKm(h.dueDate) }}</td>
                      <td>
                        <span class="fw-medium">{{ h.title }}</span>
                        <div v-if="h.description" class="text-muted small comment-cell">{{ h.description }}</div>
                      </td>
                      <td class="text-nowrap">{{ h.gradeName }} {{ h.className }}</td>
                      <td>{{ subjectLabel(h) }}</td>
                      <td class="text-nowrap">
                        <span class="badge" :class="`text-bg-${STATUS_STYLE[h.status]}`">{{ homeworkStatusLabel(h.status) }}</span>
                        <span v-if="overdue(h)" class="badge text-bg-danger ms-1">{{ t('homework.overdue') }}</span>
                      </td>
                      <td class="text-nowrap small" data-homework-summary>
                        <div>{{ t('homework.handedInOf', { done: handedIn(h), total: h.studentCount }) }}</div>
                        <div v-if="h.maxScore !== null" class="text-muted">
                          {{ t('homework.markedOf', { done: h.markedCount, total: h.studentCount }) }}<template v-if="classAverage(h) !== null"> · {{ t('homework.averageIs', { percent: formatNumber(classAverage(h)) }) }}</template>
                        </div>
                        <div v-else class="text-muted">{{ t('homework.noMarks') }}</div>
                      </td>
                      <td class="text-end text-nowrap">
                        <button type="button" class="btn btn-outline-primary btn-sm me-1" data-homework-records :disabled="busyId !== null" @click="openRecords(h)"><AppIcon name="clipboard-check" />{{ t('homework.students') }}</button>
                        <template v-if="h.status === 'ASSIGNED'">
                          <button type="button" class="btn btn-outline-success btn-sm" :disabled="busyId !== null" @click="setStatus(h, 'DONE')"><AppIcon name="check-lg" />{{ t('homework.markDone') }}</button>
                          <button type="button" class="btn btn-outline-secondary btn-sm ms-1" :disabled="busyId !== null" @click="setStatus(h, 'CANCELLED')"><AppIcon name="x-circle-fill" />{{ t('homework.cancel') }}</button>
                        </template>
                        <button v-else type="button" class="btn btn-outline-secondary btn-sm" :disabled="busyId !== null" @click="setStatus(h, 'ASSIGNED')"><AppIcon name="arrow-clockwise" />{{ t('homework.reopen') }}</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm ms-1" :aria-label="t('common.edit')" :title="t('common.edit')" @click="openForm(h)"><AppIcon name="pencil" /></button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </StateBlock>
          </template>
        </StateBlock>
      </div>
    </div>

    <HomeworkRecordsModal v-model="showRecords" :homework="recordsFor" :closed="closed" @saved="loadItems" />
    <HomeworkFormModal v-model="showForm" :homework="editing" :classes="classes" :subjects="subjects" :default-class-id="classId" @saved="loadItems" @stale="loadItems" />
  </div>
</template>
