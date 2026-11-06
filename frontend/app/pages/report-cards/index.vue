<script setup lang="ts">
import { examsApi } from '~/services/examsApi';
import { reportCardsApi } from '~/services/reportCardsApi';
import type { Examination, ReportCard } from '~/types/api';
import { formatNumber } from '~/utils/score';
import { sortByKhmer } from '~/utils/sort';

// Report cards: choose the class and the examination, look over each student's result, write the teacher's comment,
// then print one card or every card of the class (one per page, A4).
const { t } = useI18n();
const route = useRoute();
const { messageFor } = useApiError();

const { years, classes, yearId, classId, closed, loading: pickerLoading, error: pickerError, load: loadPicker } = useClassPicker();
const exams = ref<Examination[]>([]);
const examId = ref<number | null>(null);
const cards = ref<ReportCard[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const commenting = ref<ReportCard | null>(null);
const showComment = ref(false);

const honorPath = computed(() => `/honor-roll?examinationId=${examId.value}&classId=${classId.value}`);
const rankingPath = computed(() => `/monthly-ranking?examinationId=${examId.value}&classId=${classId.value}`);
const readyCount = computed(() => cards.value.filter((c) => c.complete).length);
const printAll = computed(() => `/print/report-cards?examinationId=${examId.value}&classId=${classId.value}`);
const printOne = (card: ReportCard): string => `${printAll.value}&studentId=${card.studentId}`;

async function loadExams(): Promise<void> {
  if (yearId.value === null) {
    exams.value = [];
    examId.value = null;
    return;
  }
  exams.value = await examsApi.list(yearId.value);
  if (!exams.value.some((e) => e.id === examId.value)) examId.value = exams.value[exams.value.length - 1]?.id ?? null;
}

async function loadCards(): Promise<void> {
  cards.value = [];
  loadError.value = null;
  if (examId.value === null || classId.value === null) return;
  const target = { examId: examId.value, classId: classId.value };
  loading.value = true;
  try {
    const found = await reportCardsApi.data(target.examId, target.classId);
    if (examId.value === target.examId && classId.value === target.classId) cards.value = sortByKhmer(found, (c) => c.nameKm);
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    const wanted = Number(route.query.examinationId);
    if (Number.isInteger(wanted) && wanted > 0 && examId.value === null) {
      const exam = await examsApi.get(wanted);
      yearId.value = exam.academicYearId;
      examId.value = exam.id;
    }
    await loadPicker();
    await loadExams();
    await loadCards();
  } catch (raised) {
    loadError.value = messageFor(raised);
  }
}

function comment(card: ReportCard): void {
  commenting.value = card;
  showComment.value = true;
}

watch(yearId, () => {
  loadExams().catch((raised) => {
    loadError.value = messageFor(raised);
  });
});
watch([examId, classId], loadCards);
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('reportCards.title')" :subtitle="t('reportCards.subtitle')">
      <NuxtLink v-if="examId !== null && classId !== null && cards.length > 0" :to="rankingPath" class="btn btn-outline-primary" data-testid="monthly-ranking"><AppIcon name="list-ol" />{{ t('ranking.button') }}</NuxtLink>
      <NuxtLink v-if="examId !== null && classId !== null && cards.length > 0" :to="honorPath" class="btn btn-outline-primary" data-testid="honor-roll"><AppIcon name="award" />{{ t('honor.button') }}</NuxtLink>
      <NuxtLink v-if="examId !== null && classId !== null && cards.length > 0" :to="printAll" class="btn btn-primary" data-testid="print-all"><AppIcon name="printer" />{{ t('reportCards.printAll') }}</NuxtLink>
    </PageHeader>

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="pickerLoading" :error="pickerError" @retry="load">
          <p v-if="years.length === 0" class="mb-0">
            {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <div class="filter-bar">
              <ClassPicker v-model:year-id="yearId" v-model:class-id="classId" :years="years" :classes="classes" />
              <div>
                <label for="card-exam" class="visually-hidden">{{ t('reportCards.examination') }}</label>
                <select id="card-exam" v-model="examId" class="form-select">
                  <option v-if="exams.length === 0" :value="null">{{ t('reportCards.noExams') }}</option>
                  <option v-for="e in exams" :key="e.id" :value="e.id">{{ e.nameKm }}</option>
                </select>
              </div>
            </div>
            <p v-if="closed" class="text-muted">{{ t('reportCards.yearClosed') }}</p>

            <StateBlock :loading="loading" :error="loadError" @retry="loadCards">
              <p v-if="examId === null || classId === null" class="text-muted mb-0">{{ t('reportCards.choose') }}</p>
              <p v-else-if="cards.length === 0" class="text-muted mb-0">{{ t('attendance.noStudents') }}</p>
              <template v-else>
                <p class="text-muted">{{ t('reportCards.readyCount', { ready: readyCount, total: cards.length }) }}</p>
                <div class="table-responsive scroll-x">
                  <table class="table table-hover align-middle mb-0" data-testid="cards-table">
                    <thead>
                      <tr>
                        <th>{{ t('students.nameKm') }}</th>
                        <th class="text-end">{{ t('exams.percent') }}</th>
                        <th>{{ t('exams.band') }}</th>
                        <th class="text-end">{{ t('exams.rank') }}</th>
                        <th>{{ t('reportCards.comment') }}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="card in cards" :key="card.enrollmentId" :data-student="card.studentCode">
                        <td class="fw-medium">{{ card.nameKm }}</td>
                        <td class="text-end">
                          <span v-if="card.percent !== null">{{ formatNumber(card.percent) }}</span>
                          <span v-else class="badge text-bg-secondary">{{ t('exams.incomplete') }}</span>
                        </td>
                        <td class="text-nowrap">{{ card.bandLetter ? `${card.bandLetter} · ${card.bandLabel}` : '—' }}</td>
                        <td class="text-end">{{ card.rank === null ? '—' : `${card.rank} / ${card.rankedCount}` }}</td>
                        <td class="comment-cell">{{ card.comment ?? '—' }}</td>
                        <td class="text-end text-nowrap">
                          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="closed" @click="comment(card)"><AppIcon name="pencil" />{{ t('reportCards.writeComment') }}</button>
                          <NuxtLink :to="printOne(card)" class="btn btn-outline-primary btn-sm ms-1"><AppIcon name="printer" />{{ t('print.print') }}</NuxtLink>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>
            </StateBlock>
          </template>
        </StateBlock>
      </div>
    </div>

    <ReportCardCommentModal v-model="showComment" :card="commenting" @saved="loadCards" @stale="load" />
  </div>
</template>
