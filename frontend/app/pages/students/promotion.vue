<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import { enrollmentsApi } from '~/services/enrollmentsApi';
import type { AcademicYear, ClassDto, PromotionDecision, PromotionOutcome, PromotionSummary } from '~/types/api';
import { isApiError } from '~/utils/apiError';
import { compareKhmer, sortByKhmer } from '~/utils/sort';

// Year-end promotion of ONE class at a time. Pick the class, say for each student whether they move up, repeat or (grade 6) graduate,
// preview (nothing is written), then apply. The server checks everything first: a request is applied completely or not at all,
// and cannot be applied twice.
interface Row {
  enrollmentId: number;
  studentId: number;
  nameKm: string;
  studentCode: string;
  include: boolean;
  outcome: PromotionOutcome;
  toClassId: string;
}

const FINAL_GRADE = 6;

const { t } = useI18n();
const { messageFor, validationText } = useApiError();
const notify = useNotify();
const { outcomeOptions } = useLabels();

const years = ref<AcademicYear[]>([]);
const fromYearId = ref<number | null>(null);
const toYearId = ref<number | null>(null);
const fromClasses = ref<ClassDto[]>([]);
const toClasses = ref<ClassDto[]>([]);
const fromClassId = ref('');
const promoteAll = ref('');
const rows = ref<Row[]>([]);
const summary = ref<PromotionSummary | null>(null);
const problems = ref<Record<number, string>>({});
const loading = ref(true);
const loadError = ref<string | null>(null);
const working = ref(false);
const confirmOpen = ref(false);
const lastResult = ref<PromotionSummary | null>(null);

const fromClass = computed(() => fromClasses.value.find((c) => String(c.id) === fromClassId.value) ?? null);
const level = computed(() => fromClass.value?.gradeLevel ?? 0);
const toYears = computed(() => years.value.filter((y) => y.id !== fromYearId.value && y.status === 'OPEN'));
const included = computed(() => rows.value.filter((row) => row.include));
const promoteTargets = computed(() => targetsFor('PROMOTED'));
const availableOutcomes = computed(() => outcomeOptions.value.filter((o) => (level.value === FINAL_GRADE ? o.value !== 'PROMOTED' : o.value !== 'GRADUATED')));

const sortClasses = (list: ClassDto[]) => [...list].sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));

/** Classes of the target year a student with this outcome may go to: the next grade to move up, the same grade to repeat. */
function targetsFor(outcome: PromotionOutcome): ClassDto[] {
  if (outcome === 'GRADUATED') return [];
  const wanted = outcome === 'PROMOTED' ? level.value + 1 : level.value;
  return toClasses.value.filter((c) => c.gradeLevel === wanted);
}

/** A class is preselected only when there is exactly one to choose from. */
function defaultTarget(outcome: PromotionOutcome): string {
  const options = targetsFor(outcome);
  return options.length === 1 && options[0] ? String(options[0].id) : '';
}

function defaultOutcome(): PromotionOutcome {
  return level.value === FINAL_GRADE ? 'GRADUATED' : 'PROMOTED';
}

function changed(): void {
  summary.value = null;
  problems.value = {};
}

async function loadYears(): Promise<void> {
  loadError.value = null;
  try {
    years.value = await academicApi.years();
    const from = years.value.find((y) => y.current) ?? years.value[0] ?? null;
    fromYearId.value = from?.id ?? null;
    const later = years.value.filter((y) => y.id !== from?.id && y.status === 'OPEN');
    toYearId.value = (later.filter((y) => from && y.startDate > from.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? later[0])?.id ?? null;
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function loadFromClasses(): Promise<void> {
  fromClassId.value = '';
  rows.value = [];
  changed();
  fromClasses.value = fromYearId.value === null ? [] : sortClasses(await classesApi.list({ yearId: fromYearId.value }));
}

async function loadToClasses(): Promise<void> {
  changed();
  toClasses.value = toYearId.value === null ? [] : sortClasses(await classesApi.list({ yearId: toYearId.value }));
  applyDefaults();
}

function applyDefaults(): void {
  for (const row of rows.value) row.toClassId = defaultTarget(row.outcome);
  promoteAll.value = defaultTarget('PROMOTED');
}

async function loadRoster(): Promise<void> {
  changed();
  rows.value = [];
  if (!fromClassId.value) return;
  const roster = await classesApi.students(Number(fromClassId.value));
  const outcome = defaultOutcome();
  rows.value = sortByKhmer(roster, (r) => r.nameKm).map((r) => ({
    enrollmentId: r.enrollmentId,
    studentId: r.studentId,
    nameKm: r.nameKm,
    studentCode: r.studentCode,
    include: true,
    outcome,
    toClassId: defaultTarget(outcome),
  }));
  promoteAll.value = defaultTarget('PROMOTED');
}

function outcomeChanged(row: Row): void {
  row.toClassId = defaultTarget(row.outcome);
  changed();
}

function promoteAllChanged(): void {
  for (const row of rows.value) if (row.outcome === 'PROMOTED') row.toClassId = promoteAll.value;
  changed();
}

function decisions(): PromotionDecision[] {
  return included.value.map((row) => ({
    enrollmentId: row.enrollmentId,
    outcome: row.outcome,
    toClassId: row.outcome === 'GRADUATED' || !row.toClassId ? null : Number(row.toClassId),
  }));
}

/** The server names problems "decisions[i]" by position in the request: map them back to the students' rows. */
function readProblems(error: unknown): boolean {
  if (!isApiError(error)) return false;
  const found: Record<number, string> = {};
  for (const fe of error.fieldErrors) {
    const m = /^decisions\[(\d+)\]$/.exec(fe.field);
    if (m && !(Number(m[1]) in found)) found[Number(m[1])] = fe.code;
  }
  problems.value = found;
  return Object.keys(found).length > 0;
}

function problemFor(row: Row): string {
  const index = included.value.indexOf(row);
  const code = index >= 0 ? problems.value[index] : undefined;
  return code ? validationText(code) : '';
}

async function run(dryRun: boolean): Promise<void> {
  if (fromYearId.value === null || toYearId.value === null) return;
  working.value = true;
  problems.value = {};
  try {
    const result = await enrollmentsApi.promote(fromYearId.value, toYearId.value, decisions(), dryRun);
    if (dryRun) {
      summary.value = result;
    } else {
      lastResult.value = result;
      summary.value = null;
      notify.success(t('promotion.done'));
      await loadFromClasses();
      await loadToClasses();
    }
  } catch (error) {
    summary.value = null;
    if (!readProblems(error)) notify.error(messageFor(error));
    else notify.error(t('promotion.fixProblems'));
  } finally {
    working.value = false;
    confirmOpen.value = false;
  }
}

watch(fromYearId, () => {
  loadFromClasses().catch((e) => notify.error(messageFor(e)));
});
watch(toYearId, () => {
  loadToClasses().catch((e) => notify.error(messageFor(e)));
});
watch(fromClassId, () => {
  loadRoster().catch((e) => notify.error(messageFor(e)));
});
onMounted(async () => {
  await loadYears();
  if (fromYearId.value !== null) await loadFromClasses();
  if (toYearId.value !== null) await loadToClasses();
});
useReloadOnReconnect(loadYears);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('promotion.title')" :subtitle="t('promotion.subtitle')">
      <NuxtLink to="/students" class="btn btn-outline-secondary"><AppIcon name="arrow-left" />{{ t('common.back') }}</NuxtLink>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="loadYears">
      <div class="card mb-3">
        <div class="card-body">
          <p v-if="years.length < 2 || toYears.length === 0" class="mb-0">
            {{ t('promotion.needTwoYears') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <div class="row">
              <div class="col-md-4 mb-3">
                <label for="promo-from-year" class="form-label">{{ t('promotion.fromYear') }}</label>
                <select id="promo-from-year" v-model="fromYearId" class="form-select">
                  <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label for="promo-to-year" class="form-label">{{ t('promotion.toYear') }}</label>
                <select id="promo-to-year" v-model="toYearId" class="form-select">
                  <option v-for="y in toYears" :key="y.id" :value="y.id">{{ y.nameKm }}</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label for="promo-class" class="form-label">{{ t('promotion.class') }}</label>
                <select id="promo-class" v-model="fromClassId" class="form-select">
                  <option value="">{{ t('common.choose') }}</option>
                  <option v-for="c in fromClasses" :key="c.id" :value="String(c.id)">{{ c.gradeName }} {{ c.nameKm }} ({{ c.studentCount }})</option>
                </select>
              </div>
            </div>
            <p class="text-muted mb-0">{{ t('promotion.intro') }}</p>
          </template>
        </div>
      </div>

      <div v-if="fromClassId && rows.length === 0" class="card mb-3">
        <div class="card-body text-muted">{{ t('promotion.noStudents') }}</div>
      </div>

      <div v-if="rows.length" class="card mb-3">
        <div class="card-body">
          <div v-if="level < FINAL_GRADE" class="row align-items-end mb-3">
            <div class="col-md-6">
              <label for="promo-all" class="form-label">{{ t('promotion.promoteAllTo') }}</label>
              <select id="promo-all" v-model="promoteAll" class="form-select" @change="promoteAllChanged">
                <option value="">{{ t('common.choose') }}</option>
                <option v-for="c in promoteTargets" :key="c.id" :value="String(c.id)">{{ c.gradeName }} {{ c.nameKm }}</option>
              </select>
              <div v-if="promoteTargets.length === 0" class="form-text text-danger">{{ t('promotion.noTargetClasses') }}</div>
            </div>
          </div>
          <div class="table-responsive scroll-x">
            <table class="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col"><span class="visually-hidden">{{ t('promotion.include') }}</span></th>
                  <th scope="col">{{ t('students.nameKm') }}</th>
                  <th scope="col">{{ t('promotion.outcomeLabel') }}</th>
                  <th scope="col">{{ t('promotion.toClass') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.enrollmentId">
                  <td>
                    <input v-model="row.include" type="checkbox" class="form-check-input" :aria-label="t('promotion.includeStudent', { name: row.nameKm })" @change="changed" />
                  </td>
                  <td>
                    {{ row.nameKm }} <span class="text-muted small">{{ row.studentCode }}</span>
                    <div v-if="problemFor(row)" class="field-error" role="alert">{{ problemFor(row) }}</div>
                  </td>
                  <td>
                    <select v-model="row.outcome" class="form-select form-select-sm" :disabled="!row.include" :aria-label="t('promotion.outcomeOf', { name: row.nameKm })" @change="outcomeChanged(row)">
                      <option v-for="o in availableOutcomes" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </td>
                  <td>
                    <select v-model="row.toClassId" class="form-select form-select-sm" :disabled="!row.include || row.outcome === 'GRADUATED'" :aria-label="t('promotion.toClassOf', { name: row.nameKm })" @change="changed">
                      <option value="">{{ row.outcome === 'GRADUATED' ? '—' : t('common.choose') }}</option>
                      <option v-for="c in targetsFor(row.outcome)" :key="c.id" :value="String(c.id)">{{ c.gradeName }} {{ c.nameKm }}</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex gap-2 mt-3">
            <LoadingButton icon="clipboard-check" :loading="working && !confirmOpen" :disabled="included.length === 0" @click="run(true)">{{ t('promotion.preview') }}</LoadingButton>
          </div>
        </div>
      </div>

      <div v-if="summary" class="card mb-3 promotion-summary">
        <div class="card-body">
          <h2 class="h5">{{ t('promotion.summaryTitle') }}</h2>
          <p>{{ t('promotion.summaryCounts', { promoted: summary.promoted, repeated: summary.repeated, graduated: summary.graduated }) }}</p>
          <div v-if="summary.classes.length" class="table-responsive scroll-x mb-3">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>{{ t('promotion.toClass') }}</th>
                  <th class="text-end">{{ t('promotion.beforeAfter') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in summary.classes" :key="c.classId">
                  <td>{{ c.gradeName }} {{ c.className }}</td>
                  <td class="text-end text-nowrap">
                    {{ c.current }} + {{ c.adding }} = {{ c.current + c.adding }} / {{ c.capacity }}
                    <span v-if="c.current + c.adding > c.capacity" class="badge text-bg-warning ms-2">{{ t('classes.overCapacityBadge') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <LoadingButton icon="arrow-up-circle" :loading="working" @click="confirmOpen = true">{{ t('promotion.apply') }}</LoadingButton>
        </div>
      </div>

      <div v-if="lastResult" class="alert alert-success" role="status">
        {{ t('promotion.lastResult', { promoted: lastResult.promoted, repeated: lastResult.repeated, graduated: lastResult.graduated }) }}
      </div>
    </StateBlock>

    <ConfirmModal
      v-model="confirmOpen"
      variant="primary"
      :title="t('promotion.confirmTitle')"
      :message="t('promotion.confirmMessage', { n: included.length })"
      :confirm-label="t('promotion.apply')"
      :loading="working"
      @confirm="run(false)"
    />
  </div>
</template>
