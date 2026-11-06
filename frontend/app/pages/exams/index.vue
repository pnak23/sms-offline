<script setup lang="ts">
import { examsApi } from '~/services/examsApi';
import type { Examination } from '~/types/api';
import { formatDateKm } from '~/utils/date';

// The examinations of one academic year (the current one by default). A row opens the examination: subjects, scores and results.
const { t } = useI18n();
const { messageFor } = useApiError();
const { examKindLabel } = useLabels();

const { years, yearId, year, closed, loading: pickerLoading, error: pickerError, load: loadPicker } = useClassPicker();
const exams = ref<Examination[]>([]);
const listLoading = ref(false);
const listError = ref<string | null>(null);
const showForm = ref(false);

async function loadExams(): Promise<void> {
  listError.value = null;
  if (yearId.value === null) {
    exams.value = [];
    return;
  }
  listLoading.value = true;
  try {
    exams.value = await examsApi.list(yearId.value);
  } catch (raised) {
    listError.value = messageFor(raised);
  } finally {
    listLoading.value = false;
  }
}

async function load(): Promise<void> {
  await loadPicker();
  await loadExams();
}

watch(yearId, loadExams);
onMounted(load);
useReloadOnReconnect(load);

const dates = (e: Examination): string => (e.startDate ? `${formatDateKm(e.startDate)}${e.endDate ? ` → ${formatDateKm(e.endDate)}` : ''}` : '—');
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('exams.title')" :subtitle="t('exams.subtitle')">
      <button type="button" class="btn btn-primary" :disabled="yearId === null || closed" @click="showForm = true"><AppIcon name="plus-lg" />{{ t('exams.add') }}</button>
    </PageHeader>

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="pickerLoading" :error="pickerError" @retry="load">
          <p v-if="years.length === 0" class="mb-0">
            {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <div class="filter-bar">
              <div>
                <label for="exam-year" class="visually-hidden">{{ t('classes.year') }}</label>
                <select id="exam-year" v-model="yearId" class="form-select">
                  <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}{{ y.current ? ` (${t('academic.year.current')})` : '' }}</option>
                </select>
              </div>
            </div>
            <p v-if="closed" class="text-muted">{{ t('exams.yearClosed') }}</p>

            <StateBlock :loading="listLoading" :error="listError" @retry="loadExams">
              <p v-if="exams.length === 0" class="text-muted mb-0">{{ t('exams.empty') }}</p>
              <div v-else class="table-responsive scroll-x">
                <table class="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>{{ t('exams.name') }}</th>
                      <th>{{ t('exams.kindLabel') }}</th>
                      <th>{{ t('exams.term') }}</th>
                      <th>{{ t('exams.dates') }}</th>
                      <th class="text-end">{{ t('exams.scoresEntered') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="e in exams" :key="e.id">
                      <td class="fw-medium"><NuxtLink :to="`/exams/${e.id}`">{{ e.nameKm }}</NuxtLink></td>
                      <td>{{ examKindLabel(e.kind) }}</td>
                      <td>{{ e.termNo ?? '—' }}</td>
                      <td class="text-nowrap">{{ dates(e) }}</td>
                      <td class="text-end">{{ e.scoreCount }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </StateBlock>
          </template>
        </StateBlock>
      </div>
    </div>

    <ExamFormModal v-model="showForm" :exam="null" :year-id="yearId" :year-name="year?.nameKm ?? ''" @saved="loadExams" />
  </div>
</template>
