<script setup lang="ts">
import { examsApi } from '~/services/examsApi';
import type { StudentExamResult } from '~/types/api';
import { formatNumber } from '~/utils/score';

// A student's results in every examination of every year they were enrolled: the percentage, the grade band, the rank and pass or fail.
const props = defineProps<{ studentId: number }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const { examKindLabel } = useLabels();

const results = ref<StudentExamResult[]>([]);
const loadError = ref<string | null>(null);
const loading = ref(true);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    results.value = await examsApi.studentResults(props.studentId);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="card mt-3" data-testid="student-results">
    <div class="card-body">
      <h2 class="h5">{{ t('students.resultsTitle') }}</h2>
      <StateBlock :loading="loading" :error="loadError" @retry="load">
        <p v-if="results.length === 0" class="text-muted mb-0">{{ t('students.noResults') }}</p>
        <div v-else class="table-responsive scroll-x">
          <table class="table table-sm mb-0">
            <thead>
              <tr>
                <th>{{ t('classes.year') }}</th>
                <th>{{ t('exams.name') }}</th>
                <th>{{ t('students.class') }}</th>
                <th class="text-end">{{ t('exams.percent') }}</th>
                <th>{{ t('exams.band') }}</th>
                <th class="text-end">{{ t('exams.rank') }}</th>
                <th>{{ t('exams.outcome') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in results" :key="`${r.examinationId}-${r.classId}`">
                <td>{{ r.yearName }}</td>
                <td><NuxtLink :to="`/exams/${r.examinationId}`">{{ r.examinationName }}</NuxtLink> <span class="text-muted small">{{ examKindLabel(r.kind) }}</span></td>
                <td>{{ r.gradeName }} {{ r.className }}</td>
                <td class="text-end">{{ r.result.percent === null ? '—' : formatNumber(r.result.percent) }}</td>
                <td class="text-nowrap">{{ r.result.bandLetter ? `${r.result.bandLetter} · ${r.result.bandLabel}` : '—' }}</td>
                <td class="text-end">{{ r.result.rank ?? '—' }}</td>
                <td>
                  <span v-if="!r.result.complete" class="badge text-bg-secondary">{{ t('exams.incomplete') }}</span>
                  <span v-else-if="r.result.passed" class="badge text-bg-success">{{ t('exams.passed') }}</span>
                  <span v-else class="badge text-bg-danger">{{ t('exams.failed') }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StateBlock>
    </div>
  </div>
</template>
