<script setup lang="ts">
import { examsApi } from '~/services/examsApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { Examination } from '~/types/api';
import { formatLongDateKm, toIsoDate, todayIso } from '~/utils/date';
import type { HonorStyleId } from '~/utils/honorArt';
import {
  HONOR_COUNTS, HONOR_TEXT_KEYS, HONOR_TOKENS, STANDARD_HONOR_DEFAULTS, honorPrintPath, honorSettingsOf, honorTextsProblem, parseHonorQuery,
  type HonorCount, type HonorDefaults, type HonorFormats, type HonorOptions, type HonorRoll, type HonorTexts,
} from '~/utils/honorRoll';

// The roll of honour (តារាងកិត្តិយស) has its OWN page: choose the class and the examination, choose the date, set the five texts and how they look, see the
// certificate beside the form, then "Preview and print". The page starts from the ONE saved default (what "Save as the default" stores), so usually only the
// DATE changes. Coming back from the print page brings you back HERE with everything you had chosen (it travels in the address, never in the browser).
const { t } = useI18n();
const route = useRoute();
const notify = useNotify();
const { failureText, messageFor } = useApiError();
const preferences = usePreferencesStore();

const { years, classes, yearId, classId, schoolClass, loading: pickerLoading, error: pickerError, load: loadPicker } = useClassPicker();
const exams = ref<Examination[]>([]);
const examId = ref<number | null>(null);
const loadError = ref<string | null>(null);

const count = ref<HonorCount>(STANDARD_HONOR_DEFAULTS.count);
const artStyle = ref<HonorStyleId>(STANDARD_HONOR_DEFAULTS.style);
const allClasses = ref(STANDARD_HONOR_DEFAULTS.allClasses);
const texts = ref<HonorTexts>({ ...STANDARD_HONOR_DEFAULTS });
const formats = ref<HonorFormats>(STANDARD_HONOR_DEFAULTS.formats);
const date = ref(todayIso());
const saving = ref(false);
const saveError = ref<string | null>(null);

const exam = computed(() => exams.value.find((e) => e.id === examId.value) ?? null);
const dateValid = computed(() => toIsoDate(date.value) !== null);
const textsValid = computed(() => honorTextsProblem(texts.value) === null);
const canOpen = computed(() => exam.value !== null && dateValid.value && textsValid.value && (classId.value !== null || allClasses.value));

function fill(d: HonorDefaults): void {
  count.value = d.count;
  artStyle.value = d.style;
  allClasses.value = d.allClasses;
  texts.value = { header: d.header, subtitle: d.subtitle, dateLines: d.dateLines, titleRight: d.titleRight, titleLeft: d.titleLeft };
  formats.value = d.formats;
}

const current = computed<HonorDefaults>(() => ({ ...texts.value, count: count.value, style: artStyle.value, allClasses: allClasses.value, formats: formats.value }));
/** The form differs from the saved default (the date and the class are not part of it). */
const differs = computed(() => JSON.stringify(honorSettingsOf(current.value)) !== JSON.stringify(honorSettingsOf(preferences.honorDefaults)));

// the preview: the real class, examination and chosen date, with made-up names (the real names come on the print page)
const sampleRoll = computed<HonorRoll>(() => ({
  count: count.value,
  entries: Array.from({ length: count.value }, (_, i) => ({ rank: i + 1, studentId: i + 1, nameKm: t('honor.sample.student', { n: i + 1 }), percent: null })),
  extra: 0,
  ranked: count.value,
  total: count.value,
}));
const previewOptions = computed<HonorOptions>(() => ({ ...texts.value, count: count.value, style: artStyle.value, formats: formats.value, date: dateValid.value ? date.value : todayIso() }));
const previewClass = computed(() => (schoolClass.value ? `${schoolClass.value.gradeName} ${schoolClass.value.nameKm}` : t('honor.sample.class')));

async function loadExams(): Promise<void> {
  if (yearId.value === null) {
    exams.value = [];
    examId.value = null;
    return;
  }
  exams.value = await examsApi.list(yearId.value);
  if (!exams.value.some((e) => e.id === examId.value)) examId.value = exams.value[exams.value.length - 1]?.id ?? null;
}

let fromAddress = false;
async function load(): Promise<void> {
  loadError.value = null;
  try {
    const parsed = parseHonorQuery(route.query);
    // coming back from the print page: everything chosen there is in the address; coming from a link with only an examination and a class: the saved default
    fromAddress = route.query.count !== undefined || route.query.header !== undefined;
    if (fromAddress) {
      const o = parsed.options;
      count.value = o.count;
      artStyle.value = o.style;
      allClasses.value = parsed.all;
      texts.value = { header: o.header, subtitle: o.subtitle, dateLines: o.dateLines, titleRight: o.titleRight, titleLeft: o.titleLeft };
      formats.value = o.formats;
      if (o.date) date.value = o.date;
    } else if (preferences.loaded) {
      fill(preferences.honorDefaults);
    }
    if (Number.isInteger(parsed.examinationId) && parsed.examinationId > 0 && examId.value === null) {
      const wanted = await examsApi.get(parsed.examinationId);
      yearId.value = wanted.academicYearId;
      examId.value = wanted.id;
    }
    if (parsed.classId !== null) classId.value = parsed.classId;
    await loadPicker();
    await loadExams();
  } catch (raised) {
    loadError.value = messageFor(raised);
  }
}

async function openPrintPage(): Promise<void> {
  const chosen = exam.value;
  if (!chosen || !canOpen.value) return;
  await navigateTo(honorPrintPath(chosen.id, allClasses.value ? null : classId.value, { ...texts.value, count: count.value, style: artStyle.value, formats: formats.value, date: date.value }));
}

async function saveDefault(): Promise<void> {
  if (!textsValid.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    await preferences.save(honorSettingsOf(current.value));
    notify.success(t('honor.defaults.saved'));
  } catch (raised) {
    saveError.value = failureText(raised);
  } finally {
    saving.value = false;
  }
}

watch(yearId, () => {
  loadExams().catch((raised) => {
    loadError.value = messageFor(raised);
  });
});
// the saved default arrives after sign-in; a page opened with no address of its own takes it as soon as it is there
watch(() => preferences.loaded, (loaded) => {
  if (loaded && !fromAddress) fill(preferences.honorDefaults);
});
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container" data-testid="honor-page">
    <PageHeader :title="t('honor.page.title')" :subtitle="t('honor.page.subtitle')" />

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
                <label for="honor-exam" class="visually-hidden">{{ t('reportCards.examination') }}</label>
                <select id="honor-exam" v-model="examId" class="form-select">
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
            <p class="text-muted mb-2">{{ t('honor.intro', { exam: exam?.nameKm ?? '' }) }}</p>
            <p class="text-muted mb-3" data-testid="honor-national-hint">{{ t('honor.nationalHint') }}</p>
            <form id="honor-form" novalidate data-testid="honor-form" @submit.prevent="openPrintPage">
              <div class="mb-3">
                <label for="honor-date" class="form-label fw-semibold">{{ t('honor.date') }}</label>
                <div class="d-flex flex-wrap align-items-center gap-3">
                  <input id="honor-date" v-model="date" class="form-control w-auto" :class="{ 'is-invalid': !dateValid }" type="date" />
                  <span v-if="dateValid" class="text-muted" data-testid="honor-date-long">{{ formatLongDateKm(date) }}</span>
                  <span v-else class="text-danger">{{ t('validation.INVALID_DATE') }}</span>
                </div>
                <div class="form-text">{{ t('honor.dateHint') }}</div>
              </div>

              <div class="mb-3">
                <span class="form-label d-block">{{ t('honor.count') }}</span>
                <div class="d-flex gap-3">
                  <div v-for="n in HONOR_COUNTS" :key="n" class="form-check">
                    <input :id="`honor-count-${n}`" v-model="count" class="form-check-input" type="radio" name="honor-count" :value="n" />
                    <label class="form-check-label" :for="`honor-count-${n}`">{{ t('honor.countOption', { count: n }) }}</label>
                  </div>
                </div>
              </div>

              <div class="mb-3">
                <span class="form-label d-block">{{ t('honor.style.label') }}</span>
                <HonorStylePicker v-model="artStyle" />
              </div>

              <HonorTextFields v-model="texts" v-model:formats="formats" id-prefix="honor-text" :keys="HONOR_TEXT_KEYS" label-prefix="honor.field" :tokens="HONOR_TOKENS" token-label-prefix="honor.tokens" :rows="{ header: 3, subtitle: 2, dateLines: 3, titleRight: 1, titleLeft: 2 }" />

              <div class="form-check mb-4">
                <input id="honor-all" v-model="allClasses" class="form-check-input" type="checkbox" />
                <label class="form-check-label" for="honor-all">{{ t('honor.allClasses') }}</label>
              </div>

              <div class="d-flex gap-2 flex-wrap align-items-center">
                <button type="submit" class="btn btn-primary" data-testid="honor-open" :disabled="!canOpen"><AppIcon name="printer" />{{ t('honor.page.print') }}</button>
                <LoadingButton variant="outline-primary" icon="check-lg" :loading="saving" :disabled="!differs || !textsValid" data-testid="honor-def-save" @click="saveDefault">
                  {{ t('honor.page.saveDefault') }}
                </LoadingButton>
                <button type="button" class="btn btn-outline-secondary" data-testid="honor-def-reset" @click="fill(STANDARD_HONOR_DEFAULTS)">{{ t('honor.defaults.reset') }}</button>
                <span v-if="differs" class="text-muted" data-testid="honor-differs">{{ t('honor.defaults.unsaved') }}</span>
              </div>
              <p class="form-text mt-2 mb-0">{{ t('honor.page.saveHint') }}</p>
            </form>
          </div>
        </div>
      </div>
      <div class="col-xl-6">
        <div class="card">
          <div class="card-body">
            <h2 class="h5">{{ t('honor.defaults.previewTitle') }}</h2>
            <p class="text-muted small">{{ t('honor.defaults.previewHint') }}</p>
            <div class="honor-preview" data-testid="honor-preview" aria-hidden="true">
              <HonorRollSheet
                :roll="sampleRoll"
                :art-style="artStyle"
                :options="previewOptions"
                :class-label="previewClass"
                :teacher-name="schoolClass?.homeroomTeacherName ?? t('honor.sample.teacher')"
                :class-id="0"
                :exam-name="exam?.nameKm ?? t('honor.sample.exam')"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
