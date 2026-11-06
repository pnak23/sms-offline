<script setup lang="ts">
import { examsApi } from '~/services/examsApi';
import { reportCardsApi } from '~/services/reportCardsApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { Examination, ReportCard } from '~/types/api';
import { formatLongDateKm, toIsoDate, todayIso } from '~/utils/date';
import {
  COLUMN_MAX, RANKING_COLUMN_KEYS, RANKING_TEXT_KEYS, RANKING_TOKENS, STANDARD_RANKING_DEFAULTS, buildRankingRows, parseRankingQuery, rankingPrintPath,
  rankingSettingsOf, rankingTextsProblem, sampleRankingRows,
  type RankingColumns, type RankingDefaults, type RankingFormats, type RankingOptions, type RankingTexts,
} from '~/utils/monthlyRanking';

// The monthly ranking list (ភាពចំណាត់ថ្នាក់ប្រចាំខែ) has its OWN page, like the roll of honour: choose the class and the examination, choose the date, set the six texts and
// the column headings, see the list beside the form (the real students of the chosen class), then "Preview and print". The page starts from the ONE saved default, so
// usually only the DATE changes. Coming back from the print page brings you back HERE with everything you had chosen (it travels in the address, never in the browser).
const { t } = useI18n();
const route = useRoute();
const notify = useNotify();
const { failureText, messageFor } = useApiError();
const preferences = usePreferencesStore();

const { years, classes, yearId, classId, year, schoolClass, loading: pickerLoading, error: pickerError, load: loadPicker } = useClassPicker();
const exams = ref<Examination[]>([]);
const examId = ref<number | null>(null);
const cards = ref<ReportCard[]>([]);
const loadError = ref<string | null>(null);

const allClasses = ref(STANDARD_RANKING_DEFAULTS.allClasses);
const colours = ref(STANDARD_RANKING_DEFAULTS.colours);
const texts = ref<RankingTexts>(pickTexts(STANDARD_RANKING_DEFAULTS));
const formats = ref<RankingFormats>(STANDARD_RANKING_DEFAULTS.formats);
const columns = ref<RankingColumns>({ ...STANDARD_RANKING_DEFAULTS.columns });
const date = ref(todayIso());
const saving = ref(false);
const saveError = ref<string | null>(null);

function pickTexts(d: RankingDefaults): RankingTexts {
  return { header: d.header, title: d.title, stats: d.stats, dateLines: d.dateLines, titleRight: d.titleRight, titleLeft: d.titleLeft };
}

const exam = computed(() => exams.value.find((e) => e.id === examId.value) ?? null);
const dateValid = computed(() => toIsoDate(date.value) !== null);
const textsValid = computed(() => rankingTextsProblem(texts.value) === null);
const canOpen = computed(() => exam.value !== null && dateValid.value && textsValid.value && (classId.value !== null || allClasses.value));

function fill(d: RankingDefaults): void {
  allClasses.value = d.allClasses;
  colours.value = d.colours;
  texts.value = pickTexts(d);
  formats.value = d.formats;
  columns.value = { ...d.columns };
}

const current = computed<RankingDefaults>(() => ({ ...texts.value, formats: formats.value, columns: columns.value, allClasses: allClasses.value, colours: colours.value }));
/** The form differs from the saved default (the date and the class are not part of it). */
const differs = computed(() => JSON.stringify(rankingSettingsOf(current.value)) !== JSON.stringify(rankingSettingsOf(preferences.rankingDefaults)));

// the preview: the real students of the chosen class and examination (the same figures as the report cards), or eight made-up ones while there is none yet
const real = computed(() => cards.value.length > 0);
const rows = computed(() => (real.value ? buildRankingRows(cards.value) : sampleRankingRows((n) => t('ranking.sample.student', { n }))));
const waiting = computed(() => (real.value ? rows.value.filter((r) => !r.complete).length : 0));
const previewOptions = computed<RankingOptions>(() => ({ ...texts.value, formats: formats.value, columns: columns.value, colours: colours.value, date: dateValid.value ? date.value : todayIso() }));
const previewClass = computed(() => (schoolClass.value ? `${schoolClass.value.gradeName} ${schoolClass.value.nameKm}` : t('ranking.sample.class')));

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
  if (examId.value === null || classId.value === null) return;
  const target = { examId: examId.value, classId: classId.value };
  try {
    const found = await reportCardsApi.data(target.examId, target.classId);
    if (examId.value === target.examId && classId.value === target.classId) cards.value = found;
  } catch (raised) {
    loadError.value = messageFor(raised);
  }
}

let fromAddress = false;
async function load(): Promise<void> {
  loadError.value = null;
  try {
    const parsed = parseRankingQuery(route.query);
    // coming back from the print page: everything chosen there is in the address; coming from a link with only an examination and a class: the saved default
    fromAddress = route.query.header !== undefined;
    if (fromAddress) {
      const o = parsed.options;
      allClasses.value = parsed.all;
      texts.value = { header: o.header, title: o.title, stats: o.stats, dateLines: o.dateLines, titleRight: o.titleRight, titleLeft: o.titleLeft };
      formats.value = o.formats;
      columns.value = { ...o.columns };
      colours.value = o.colours;
      if (o.date) date.value = o.date;
    } else if (preferences.loaded) {
      fill(preferences.rankingDefaults);
    }
    if (Number.isInteger(parsed.examinationId) && parsed.examinationId > 0 && examId.value === null) {
      const wanted = await examsApi.get(parsed.examinationId);
      yearId.value = wanted.academicYearId;
      examId.value = wanted.id;
    }
    if (parsed.classId !== null) classId.value = parsed.classId;
    await loadPicker();
    await loadExams();
    await loadCards();
  } catch (raised) {
    loadError.value = messageFor(raised);
  }
}

async function openPrintPage(): Promise<void> {
  const chosen = exam.value;
  if (!chosen || !canOpen.value) return;
  await navigateTo(rankingPrintPath(chosen.id, allClasses.value ? null : classId.value, previewOptions.value));
}

async function saveDefault(): Promise<void> {
  if (!textsValid.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    await preferences.save(rankingSettingsOf(current.value));
    notify.success(t('ranking.defaults.saved'));
  } catch (raised) {
    saveError.value = failureText(raised);
  } finally {
    saving.value = false;
  }
}

function setColumn(key: keyof RankingColumns, value: string): void {
  columns.value = { ...columns.value, [key]: value };
}

watch(yearId, () => {
  loadExams().catch((raised) => {
    loadError.value = messageFor(raised);
  });
});
watch([examId, classId], loadCards);
// the saved default arrives after sign-in; a page opened with no address of its own takes it as soon as it is there
watch(() => preferences.loaded, (loaded) => {
  if (loaded && !fromAddress) fill(preferences.rankingDefaults);
});
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container" data-testid="ranking-page">
    <PageHeader :title="t('ranking.page.title')" :subtitle="t('ranking.page.subtitle')" />

    <div class="card mb-3">
      <div class="card-body">
        <StateBlock :loading="pickerLoading" :error="pickerError ?? loadError" @retry="load">
          <p v-if="years.length === 0" class="mb-0">
            {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <div class="filter-bar">
              <ClassPicker v-model:year-id="yearId" v-model:class-id="classId" :years="years" :classes="classes" />
              <div>
                <label for="ranking-exam" class="visually-hidden">{{ t('reportCards.examination') }}</label>
                <select id="ranking-exam" v-model="examId" class="form-select">
                  <option v-if="exams.length === 0" :value="null">{{ t('reportCards.noExams') }}</option>
                  <option v-for="e in exams" :key="e.id" :value="e.id">{{ e.nameKm }}</option>
                </select>
              </div>
            </div>
            <p v-if="exam === null" class="text-muted mt-3 mb-0">{{ t('reportCards.choose') }}</p>
          </template>
        </StateBlock>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-xl-6">
        <div class="card">
          <div class="card-body">
            <FormAlert :message="saveError" />
            <p class="text-muted mb-2">{{ t('ranking.intro', { exam: exam?.nameKm ?? '' }) }}</p>
            <p class="text-muted mb-3" data-testid="ranking-national-hint">{{ t('ranking.nationalHint') }}</p>
            <p v-if="waiting > 0" class="alert alert-warning py-2" data-testid="ranking-waiting">{{ t('ranking.waiting', { count: waiting }) }}</p>
            <form id="ranking-form" novalidate data-testid="ranking-form" @submit.prevent="openPrintPage">
              <div class="mb-3">
                <label for="ranking-date" class="form-label fw-semibold">{{ t('ranking.date') }}</label>
                <div class="d-flex flex-wrap align-items-center gap-3">
                  <input id="ranking-date" v-model="date" class="form-control w-auto" :class="{ 'is-invalid': !dateValid }" type="date" />
                  <span v-if="dateValid" class="text-muted" data-testid="ranking-date-long">{{ formatLongDateKm(date) }}</span>
                  <span v-else class="text-danger">{{ t('validation.INVALID_DATE') }}</span>
                </div>
                <div class="form-text">{{ t('ranking.dateHint') }}</div>
              </div>

              <div class="mb-3">
                <div class="form-check">
                  <input id="ranking-colours" v-model="colours" class="form-check-input" type="checkbox" />
                  <label class="form-check-label" for="ranking-colours">{{ t('ranking.colours') }}</label>
                </div>
                <div class="form-text">{{ t('ranking.coloursHint') }}</div>
              </div>

              <HonorTextFields
                v-model="texts"
                v-model:formats="formats"
                id-prefix="ranking-text"
                :keys="RANKING_TEXT_KEYS"
                label-prefix="ranking.field"
                :tokens="RANKING_TOKENS"
                token-label-prefix="ranking.tokens"
                :rows="{ header: 2, title: 1, stats: 3, dateLines: 3, titleRight: 1, titleLeft: 2 }"
              />

              <div class="mb-3" data-testid="ranking-columns">
                <h2 class="h6 mb-1">{{ t('ranking.columnsTitle') }}</h2>
                <p class="text-muted small mb-2">{{ t('ranking.columnsHint', { chars: COLUMN_MAX }) }}</p>
                <div class="row g-2">
                  <div v-for="key in RANKING_COLUMN_KEYS" :key="key" class="col-sm-6">
                    <label :for="`ranking-column-${key}`" class="form-label small mb-0">{{ t(`ranking.column.${key}`) }}</label>
                    <input
                      :id="`ranking-column-${key}`"
                      :value="columns[key]"
                      class="form-control form-control-sm"
                      type="text"
                      :maxlength="COLUMN_MAX"
                      autocomplete="off"
                      spellcheck="false"
                      @input="setColumn(key, ($event.target as HTMLInputElement).value)"
                    />
                  </div>
                </div>
              </div>

              <div class="form-check mb-4">
                <input id="ranking-all" v-model="allClasses" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="ranking-all">{{ t('ranking.allClasses') }}</label>
              </div>

              <div class="d-flex gap-2 flex-wrap align-items-center">
                <button type="submit" class="btn btn-primary" data-testid="ranking-open" :disabled="!canOpen"><AppIcon name="printer" />{{ t('ranking.page.print') }}</button>
                <LoadingButton variant="outline-primary" icon="check-lg" :loading="saving" :disabled="!differs || !textsValid" data-testid="ranking-def-save" @click="saveDefault">
                  {{ t('ranking.page.saveDefault') }}
                </LoadingButton>
                <button type="button" class="btn btn-outline-secondary" data-testid="ranking-def-reset" @click="fill(STANDARD_RANKING_DEFAULTS)">{{ t('ranking.defaults.reset') }}</button>
                <span v-if="differs" class="text-muted" data-testid="ranking-differs">{{ t('ranking.defaults.unsaved') }}</span>
              </div>
              <p class="form-text mt-2 mb-0">{{ t('ranking.page.saveHint') }}</p>
            </form>
          </div>
        </div>
      </div>
      <div class="col-xl-6">
        <div class="card">
          <div class="card-body">
            <h2 class="h5">{{ t('ranking.defaults.previewTitle') }}</h2>
            <p class="text-muted small">{{ real ? t('ranking.defaults.previewReal') : t('ranking.defaults.previewSample') }}</p>
            <div class="ranking-preview" data-testid="ranking-preview" aria-hidden="true">
              <RankingSheet
                :rows="rows"
                :options="previewOptions"
                :class-label="previewClass"
                :teacher-name="schoolClass?.homeroomTeacherName ?? t('ranking.sample.teacher')"
                :class-id="0"
                :exam-name="exam?.nameKm ?? t('ranking.sample.exam')"
                :school-year="year?.nameKm ?? t('ranking.sample.schoolYear')"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
