<script setup lang="ts">
import { homeworkApi } from '~/services/homeworkApi';
import type { HomeworkHistoryRow } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { historyFigures, subjectLabel } from '~/utils/homework';
import { formatNumber } from '~/utils/score';

// A student's homework history: every assignment of every class they were in, newest first, with their own status, mark and remark (blank = not recorded).
// Homework is an independent module: nothing here is part of an examination result.
const props = defineProps<{ studentId: number }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const { homeworkStatusLabel } = useLabels();

const rows = ref<HomeworkHistoryRow[]>([]);
const loadError = ref<string | null>(null);
const loading = ref(true);

const figures = computed(() => historyFigures(rows.value));

async function load(): Promise<void> {
  loadError.value = null;
  try {
    rows.value = await homeworkApi.historyOf(props.studentId);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="card mt-3" data-testid="student-homework">
    <div class="card-body">
      <h2 class="h5">{{ t('students.homeworkTitle') }}</h2>
      <p class="text-muted small">{{ t('students.homeworkNote') }}</p>
      <StateBlock :loading="loading" :error="loadError" @retry="load">
        <p v-if="rows.length === 0" class="text-muted mb-0">{{ t('students.noHomework') }}</p>
        <template v-else>
          <p class="small" data-testid="student-homework-figures">
            {{ t('students.homeworkFigures', { assigned: figures.assigned, submitted: figures.submitted, late: figures.late, notSubmitted: figures.notSubmitted, excused: figures.excused, notRecorded: figures.notRecorded }) }}
            <template v-if="figures.percent !== null"> · {{ t('students.homeworkEarned', { earned: formatNumber(figures.earned), possible: formatNumber(figures.possible), percent: formatNumber(figures.percent) }) }}</template>
          </p>
          <div class="table-responsive scroll-x">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>{{ t('homework.dueDate') }}</th>
                  <th>{{ t('homework.titleLabel') }}</th>
                  <th>{{ t('exams.subject') }}</th>
                  <th>{{ t('students.class') }}</th>
                  <th>{{ t('homework.recordStatus') }}</th>
                  <th class="text-end">{{ t('exams.score') }}</th>
                  <th>{{ t('homework.remark') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rows" :key="r.homeworkId" :class="{ 'text-muted': r.homeworkStatus === 'CANCELLED' }" :data-homework-row="r.title">
                  <td class="text-nowrap">{{ formatDateKm(r.dueDate) }}</td>
                  <td>
                    {{ r.title }}
                    <span v-if="r.homeworkStatus === 'CANCELLED'" class="badge text-bg-secondary ms-1">{{ homeworkStatusLabel('CANCELLED') }}</span>
                  </td>
                  <td>{{ subjectLabel(r) }}</td>
                  <td class="text-nowrap">{{ r.gradeName }} {{ r.className }} · {{ r.yearName }}</td>
                  <td class="text-nowrap">{{ r.status ? t(`homework.record.${r.status}`) : '—' }}</td>
                  <td class="text-end text-nowrap">{{ r.score === null ? '—' : r.maxScore === null ? formatNumber(r.score) : `${formatNumber(r.score)} / ${formatNumber(r.maxScore)}` }}</td>
                  <td class="comment-cell">{{ r.remark ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </StateBlock>
    </div>
  </div>
</template>
