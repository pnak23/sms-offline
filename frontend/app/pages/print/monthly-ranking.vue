<script setup lang="ts">
import { classesApi } from '~/services/classesApi';
import { printCurrentPage, savePdfOfCurrentPage } from '~/services/desktop';
import { examsApi } from '~/services/examsApi';
import { reportCardsApi } from '~/services/reportCardsApi';
import type { ClassDto } from '~/types/api';
import { todayIso } from '~/utils/date';
import { buildRankingRows, parseRankingQuery, type RankingRow } from '~/utils/monthlyRanking';
import { compareKhmer } from '~/utils/sort';

// The printable monthly ranking list (ភាពចំណាត់ថ្នាក់ប្រចាំខែ), A4: one list per class, every student of the class in rank order (see utils/monthlyRanking.ts). What to
// print comes from the address (the page /monthly-ranking); nothing is stored. The list itself is components/print/RankingSheet.vue.
definePageMeta({ layout: 'print' });

const { t } = useI18n();
const route = useRoute();
const notify = useNotify();
const { messageFor } = useApiError();

const query = parseRankingQuery(route.query);
const options = { ...query.options, date: query.options.date || todayIso() };
const examName = ref('');

interface Sheet {
  cls: ClassDto;
  rows: RankingRow[];
  schoolYear: string;
}
const sheets = ref<Sheet[]>([]);
/** Classes of the examination's year that have no student yet: no list is made for them. */
const skipped = ref<string[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);
const busy = ref<'print' | 'pdf' | null>(null);

const labelOf = (cls: ClassDto): string => `${cls.gradeName} ${cls.nameKm}`;
const waiting = computed(() => sheets.value.reduce((sum, sheet) => sum + sheet.rows.filter((r) => !r.complete).length, 0));

onMounted(async () => {
  try {
    const exam = await examsApi.get(query.examinationId);
    examName.value = exam.nameKm;
    const classes = query.classId !== null
      ? [(await classesApi.get(query.classId)).schoolClass]
      : (await classesApi.list({ yearId: exam.academicYearId })).sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));
    // one class at a time: the results are worked out for each request, and a request at a time is gentler on the single database connection
    for (const cls of classes) {
      const cards = await reportCardsApi.data(exam.id, cls.id);
      const rows = buildRankingRows(cards);
      if (rows.length > 0) sheets.value.push({ cls, rows, schoolYear: cards[0]?.yearName ?? '' });
      else skipped.value.push(labelOf(cls));
    }
  } catch (e) {
    error.value = messageFor(e);
  } finally {
    loaded.value = true;
  }
});

async function back(): Promise<void> {
  await navigateTo({ path: '/monthly-ranking', query: route.query });   // back to the ranking page, with everything that was chosen
}

async function print(): Promise<void> {
  busy.value = 'print';
  try {
    await printCurrentPage();
  } catch {
    notify.error(t('print.failed'));
  } finally {
    busy.value = null;
  }
}

async function savePdf(): Promise<void> {
  busy.value = 'pdf';
  try {
    const result = await savePdfOfCurrentPage(`monthly-ranking-${query.classId ?? 'all'}.pdf`);
    if (result.saved) notify.success(t('print.pdfSaved'));
  } catch {
    notify.error(t('print.failed'));
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div :data-loaded="loaded ? '1' : undefined">
    <div class="print-toolbar no-print">
      <button type="button" class="btn btn-outline-secondary" @click="back"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null || sheets.length === 0" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null || sheets.length === 0" @click="savePdf">
        {{ t('print.savePdf') }}
      </LoadingButton>
      <span v-if="sheets.length > 0" class="text-muted" data-testid="ranking-count">{{ t('ranking.sheetCount', { count: sheets.length }) }}</span>
    </div>

    <div v-if="error" class="alert alert-danger no-print" role="alert">{{ error }}</div>
    <p v-else-if="loaded && sheets.length === 0" class="no-print" data-testid="ranking-none">{{ t('ranking.none') }}</p>
    <p v-if="skipped.length > 0" class="text-muted no-print" data-testid="ranking-skipped">{{ t('ranking.skipped', { names: skipped.join('، ') }) }}</p>
    <p v-if="waiting > 0" class="text-muted no-print" data-testid="ranking-waiting">{{ t('ranking.waiting', { count: waiting }) }}</p>

    <RankingSheet
      v-for="sheet in sheets"
      :key="sheet.cls.id"
      :rows="sheet.rows"
      :options="options"
      :class-label="labelOf(sheet.cls)"
      :teacher-name="sheet.cls.homeroomTeacherName"
      :class-id="sheet.cls.id"
      :exam-name="examName"
      :school-year="sheet.schoolYear"
    />
  </div>
</template>
