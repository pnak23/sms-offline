<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { dashboardApi } from '~/services/dashboardApi';
import { useSchoolStore } from '~/stores/school';
import { useSessionStore } from '~/stores/session';
import type { AcademicYear, Dashboard, DashboardCharts } from '~/types/api';
import type { SetupTask } from '~/types/ui';
import { CHART_COLORS } from '~/utils/charts';
import {
  attendanceSparkline, attendanceSummary, examRows, examSlices, examSummary, examTable, examTotals, feeBlocks, feesEmpty, fillRows, fillSummary, fillTable, genderSlices, genderSummary,
  genderTable, gradeRows, gradeSummary, gradeTable, trendPoints, trendTable,
} from '~/utils/dashboardCharts';
import { formatLongDateKm } from '~/utils/date';
import { findCheck, needsAttention } from '~/utils/health';
import { formatMoney } from '~/utils/money';

const { t } = useI18n();
const { messageFor } = useApiError();
const session = useSessionStore();
const school = useSchoolStore();
const health = useHealthReport();
const { examKindLabel } = useLabels();
const animate = useChartMotion();

const years = ref<AcademicYear[] | null>(null);
const dashboard = ref<Dashboard | null>(null);
const loadError = ref<string | null>(null);
// the charts are loaded apart from the figures: the figures appear at once, each chart fills in when its data arrives
const charts = ref<DashboardCharts | null>(null);
const chartsLoading = ref(true);
const chartsError = ref<string | null>(null);

const currentYear = computed(() => years.value?.find((y) => y.current) ?? null);
// The backups on THIS laptop are the school's primary protection: their state is always shown (green, or a warning); the optional copy on a USB stick only warns when the school switched its reminder on.
const backupCheck = computed(() => findCheck(health.report.value, 'BACKUP_AGE'));
const copyCheck = computed(() => findCheck(health.report.value, 'EXTERNAL_COPY'));
const showBackupBanner = computed(() => backupCheck.value?.status === 'OK' || backupCheck.value?.status === 'WARN');
const showCopyBanner = computed(() => copyCheck.value?.status === 'WARN' && copyCheck.value.code !== 'BACKUP_FOLDER_UNREADABLE');
const showHealthChip = computed(() => !!health.status.value && needsAttention(health.status.value));
const attendance = computed(() => dashboard.value?.attendanceToday ?? null);
const today = computed(() => formatLongDateKm(new Date()));

// Real data only: a task appears because the profile or the academic year really is missing.
const tasks = computed<SetupTask[]>(() => {
  const out: SetupTask[] = [];
  if (school.profile && !school.hasName) {
    out.push({ id: 'school', titleKey: 'dashboard.tasks.school.title', hintKey: 'dashboard.tasks.school.hint', to: '/settings/school', icon: 'building' });
  }
  if (years.value && !currentYear.value) {
    out.push({ id: 'year', titleKey: 'dashboard.tasks.year.title', hintKey: 'dashboard.tasks.year.hint', to: '/settings/academic', icon: 'calendar3' });
  }
  return out;
});

// ---- the charts: what each one draws (utils/dashboardCharts.ts), its summary and its table ----------------------------------------------------------------------------
const hasYear = computed(() => !!charts.value?.year);
const grades = computed(() => charts.value?.studentsByGrade.grades ?? []);
const gradeTotal = computed(() => grades.value.reduce((a, g) => a + g.male + g.female + g.unknown, 0));
const gradeBars = computed(() => gradeRows(t, grades.value));
const gradeMax = computed(() => Math.max(1, ...grades.value.map((g) => g.male + g.female + g.unknown)));
const gender = computed(() => charts.value?.gender ?? { male: 0, female: 0, unknown: 0, total: 0 });
const days = computed(() => charts.value?.attendance.days ?? []);
const trend = computed(() => trendPoints(t, days.value, charts.value?.attendance.classes ?? 0));
const fill = computed(() => fillRows(t, charts.value?.classFill ?? []));
const exam = computed(() => charts.value?.latestExam ?? null);
const examTotal = computed(() => (exam.value ? examTotals(exam.value) : { passed: 0, failed: 0, incomplete: 0, complete: 0 }));
const fees = computed(() => charts.value?.fees ?? null);
const blocks = computed(() => (fees.value ? feeBlocks(t, fees.value.series) : []));
const sparkValues = computed(() => attendanceSparkline(days.value));
const sparkVisible = computed(() => sparkValues.value.filter((v) => v !== null).length >= 2);
// the split of today's figures is the same sentence as before, only drawn in pieces that never break inside (the pieces are separated by " · ")
const splitParts = computed(() => {
  const a = attendance.value;
  if (!a) return [];
  return t(a.basis === 'DAY' ? 'dashboard.attendanceSplitDays' : 'dashboard.attendanceSplitSessions', { present: a.present, late: a.late, partial: a.partial, absent: a.absent, leave: a.leave }).split(' · ');
});

async function loadDashboard(): Promise<void> {
  dashboard.value = await dashboardApi.get();
}

async function loadCharts(): Promise<void> {
  chartsError.value = null;
  chartsLoading.value = true;
  try {
    charts.value = await dashboardApi.charts();
  } catch (raised) {
    chartsError.value = messageFor(raised);
  } finally {
    chartsLoading.value = false;
  }
}

async function load(): Promise<void> {
  loadError.value = null;
  const [, yearResult, dashboardResult] = await Promise.allSettled([
    health.run('quick'),
    academicApi.years().then((list) => {
      years.value = list;
    }),
    loadDashboard(),
    school.profile ? Promise.resolve() : school.load(),
  ]);
  const failed = [yearResult, dashboardResult].find((r) => r.status === 'rejected');
  if (failed?.status === 'rejected') loadError.value = messageFor(failed.reason);
}

function reload(): void {
  void load();
  void loadCharts();
}

onMounted(reload);
useReloadOnReconnect(async () => {
  reload();
});
</script>

<template>
  <div class="page-container dashboard">
    <section class="dash-hero" data-testid="dashboard-hero">
      <div class="dash-hero-main">
        <div class="dash-hero-meta">
          <span v-if="currentYear" class="dash-chip" data-testid="hero-year"><AppIcon name="calendar3" />{{ currentYear.nameKm }}</span>
          <span class="dash-hero-date" data-testid="hero-date">{{ today }}</span>
        </div>
        <h1 class="mb-1">{{ t('dashboard.greeting', { name: session.user?.displayName ?? '' }) }}</h1>
        <p v-if="school.hasName" class="dash-hero-school mb-0">{{ school.name }}</p>
        <p v-else-if="school.profile" class="mb-0 dash-hero-school">
          {{ t('dashboard.noSchoolName') }}
          <NuxtLink to="/settings/school">{{ t('dashboard.completeProfile') }}</NuxtLink>
        </p>
        <div class="dash-actions" data-testid="hero-actions">
          <NuxtLink to="/attendance" class="btn btn-sm dash-action is-primary"><AppIcon name="calendar-check" />{{ t('dashboard.hero.takeAttendance') }}</NuxtLink>
          <NuxtLink to="/students/new" class="btn btn-sm dash-action"><AppIcon name="plus-lg" />{{ t('dashboard.hero.addStudent') }}</NuxtLink>
          <NuxtLink to="/exams" class="btn btn-sm dash-action"><AppIcon name="journal-text" />{{ t('dashboard.hero.exams') }}</NuxtLink>
        </div>
      </div>
      <HealthChip v-if="showHealthChip && health.status.value" :status="health.status.value" class="dash-hero-health" />
    </section>

    <BackupBanner v-if="showBackupBanner && backupCheck" :check="backupCheck" @changed="health.run('quick')" />
    <BackupBanner v-if="showCopyBanner && copyCheck" :check="copyCheck" />

    <StateBlock :error="loadError" @retry="load">
      <div v-if="dashboard" class="row g-3 mb-3" data-testid="dashboard-figures">
        <div class="col-md-6 col-xl-3">
          <NuxtLink to="/students" class="card stat-tile kpi-tile">
            <div class="card-body">
              <div class="kpi-top">
                <span class="kpi-icon is-blue"><AppIcon name="mortarboard" /></span>
                <div class="stat-label">{{ t('dashboard.students') }}</div>
              </div>
              <div class="stat-value" data-testid="stat-students">{{ dashboard.students.active }}</div>
              <div class="stat-hint">{{ t('dashboard.studentsSplit', { male: dashboard.students.male, female: dashboard.students.female }) }}</div>
            </div>
          </NuxtLink>
        </div>
        <div class="col-md-6 col-xl-3">
          <NuxtLink to="/teachers" class="card stat-tile kpi-tile">
            <div class="card-body">
              <div class="kpi-top">
                <span class="kpi-icon is-teal"><AppIcon name="person-badge" /></span>
                <div class="stat-label">{{ t('dashboard.teachers') }}</div>
              </div>
              <div class="stat-value" data-testid="stat-teachers">{{ dashboard.activeTeachers }}</div>
              <div class="stat-hint">{{ t('dashboard.teachersHint') }}</div>
            </div>
          </NuxtLink>
        </div>
        <div class="col-md-6 col-xl-3">
          <NuxtLink to="/classes" class="card stat-tile kpi-tile">
            <div class="card-body">
              <div class="kpi-top">
                <span class="kpi-icon is-violet"><AppIcon name="grid-3x3-gap" /></span>
                <div class="stat-label">{{ t('dashboard.classes') }}</div>
              </div>
              <div class="stat-value" data-testid="stat-classes">{{ dashboard.classes }}</div>
              <div class="stat-hint">{{ dashboard.currentYear?.nameKm ?? t('dashboard.noYear') }}</div>
            </div>
          </NuxtLink>
        </div>
        <div v-if="attendance" class="col-md-6 col-xl-3">
          <NuxtLink to="/attendance" class="card stat-tile kpi-tile">
            <div class="card-body">
              <div class="kpi-top">
                <span class="kpi-icon is-gold"><AppIcon name="calendar-check" /></span>
                <div class="stat-label">{{ t('dashboard.attendanceToday') }}</div>
              </div>
              <!-- the value stays a direct child of the card body, as before (an older real-shell test reads the value's parent): the little trend floats beside it -->
              <Sparkline v-if="sparkVisible" class="kpi-spark" :values="sparkValues" :label="t('dashboard.charts.attendance.sparkLabel')" />
              <div class="stat-value" data-testid="stat-attendance">{{ attendance.classesRecorded }} / {{ attendance.classes }}</div>
              <div class="stat-hint" data-testid="stat-attendance-split">
                <template v-for="(part, i) in splitParts" :key="i"><span class="no-break">{{ part }}</span>{{ i !== splitParts.length - 1 ? ' · ' : '' }}</template>
              </div>
              <div class="stat-hint" data-testid="stat-attendance-basis">{{ t(`attendance.basis.${attendance.basis}`) }} · {{ t('dashboard.sheetsToday', { n: attendance.sheets }) }}</div>
            </div>
          </NuxtLink>
        </div>
      </div>

      <div v-if="tasks.length" class="mb-3"><SetupTasksCard :tasks="tasks" /></div>

      <!-- the charts: read only, loaded after the figures above; each has a summary, a table and an empty state of its own -->
      <section class="dash-charts mb-3" data-testid="dashboard-charts" :aria-label="t('dashboard.charts.title')">
        <div class="row g-3">
          <div class="col-12 col-xl-8">
            <ChartCard :title="t('dashboard.charts.attendance.title')" icon="graph-up" testid="chart-attendance" :loading="chartsLoading" :failed="chartsError" :empty="!hasYear || days.length === 0"
              :empty-text="hasYear ? t('dashboard.charts.attendance.empty') : t('dashboard.charts.noYear')" :summary="attendanceSummary(t, days, charts?.attendance.basis ?? 'DAY')" has-table @retry="loadCharts">
              <TrendChart :points="trend" :label="t('dashboard.charts.attendance.title')" :animate="animate" />
              <template #table><ChartTable :caption="t('dashboard.charts.attendance.title')" :data="trendTable(t, days)" /></template>
            </ChartCard>
          </div>
          <div class="col-12 col-md-6 col-xl-4">
            <ChartCard :title="t('dashboard.charts.gender.title')" icon="pie-chart" testid="chart-gender" :loading="chartsLoading" :failed="chartsError" :empty="gender.total === 0"
              :empty-text="t('dashboard.charts.gender.empty')" :summary="genderSummary(t, gender)" has-table @retry="loadCharts">
              <DonutChart :slices="genderSlices(t, gender)" :center-value="String(gender.total)" :center-label="t('dashboard.charts.total')" :label="t('dashboard.charts.gender.title')" :animate="animate" />
              <template #table><ChartTable :caption="t('dashboard.charts.gender.title')" :data="genderTable(t, gender)" /></template>
            </ChartCard>
          </div>
          <div class="col-12 col-md-6 col-xl-6">
            <ChartCard :title="t('dashboard.charts.grades.title')" icon="bar-chart-line" testid="chart-grades" :loading="chartsLoading" :failed="chartsError" :empty="!hasYear || gradeTotal === 0"
              :empty-text="hasYear ? t('dashboard.charts.grades.empty') : t('dashboard.charts.noYear')" :summary="gradeSummary(t, grades, charts?.studentsByGrade.notInAClass ?? 0)" has-table @retry="loadCharts">
              <BarRows :rows="gradeBars" :max="gradeMax" :label="t('dashboard.charts.grades.title')" :animate="animate" />
              <template #footer>
                <ul class="chart-legend" aria-hidden="true">
                  <li><span :style="{ background: CHART_COLORS.boys }" />{{ t('dashboard.charts.male') }}</li>
                  <li><span :style="{ background: CHART_COLORS.girls }" />{{ t('dashboard.charts.female') }}</li>
                </ul>
              </template>
              <template #table><ChartTable :caption="t('dashboard.charts.grades.title')" :data="gradeTable(t, grades)" /></template>
            </ChartCard>
          </div>
          <div class="col-12 col-xl-6">
            <ChartCard :title="t('dashboard.charts.fill.title')" icon="grid-3x3-gap" testid="chart-fill" :loading="chartsLoading" :failed="chartsError" :empty="!hasYear || fill.rows.length === 0"
              :empty-text="hasYear ? t('dashboard.charts.fill.empty') : t('dashboard.charts.noYear')" :summary="fillSummary(t, charts?.classFill ?? [])" has-table @retry="loadCharts">
              <BarRows :rows="fill.rows" :max="fill.max" :label="t('dashboard.charts.fill.title')" :animate="animate" />
              <template #footer><p class="chart-note">{{ t('dashboard.charts.fill.note') }}</p></template>
              <template #table><ChartTable :caption="t('dashboard.charts.fill.title')" :data="fillTable(t, charts?.classFill ?? [])" /></template>
            </ChartCard>
          </div>
          <div class="col-12">
            <ChartCard :title="exam ? t('dashboard.charts.exam.titleNamed', { name: exam.nameKm }) : t('dashboard.charts.exam.title')" icon="award" testid="chart-exam" :loading="chartsLoading" :failed="chartsError"
              :empty="!hasYear || !exam || exam.classes.length === 0" :empty-text="hasYear ? t('dashboard.charts.exam.empty') : t('dashboard.charts.noYear')" :summary="exam ? examSummary(t, exam) : ''" has-table @retry="loadCharts">
              <DraftNotice item="grading-rules" text-key="dashboard.charts.exam.unofficial" compact />
              <div v-if="exam" class="exam-split">
                <div class="exam-bars">
                  <p class="chart-subtitle">{{ t('dashboard.charts.exam.averageTitle', { pass: exam.passPercent ?? '' }) }}</p>
                  <BarRows :rows="examRows(t, exam)" :max="100" :label="t('dashboard.charts.exam.averageTitle', { pass: exam.passPercent ?? '' })" :animate="animate" />
                </div>
                <div class="exam-donut">
                  <p class="chart-subtitle">{{ t('dashboard.charts.exam.resultsTitle') }}</p>
                  <DonutChart :slices="examSlices(t, exam)" :center-value="String(examTotal.complete)" :center-label="t('dashboard.charts.exam.complete')" :label="t('dashboard.charts.exam.resultsTitle')" :animate="animate" />
                </div>
              </div>
              <template #table><ChartTable v-if="exam" :caption="t('dashboard.charts.exam.title')" :data="examTable(t, exam)" /></template>
            </ChartCard>
          </div>
          <div v-if="dashboard?.fees" class="col-12">
            <ChartCard :title="t('dashboard.charts.fees.title')" icon="cash-coin" testid="chart-fees" :loading="chartsLoading" :failed="chartsError" :empty="!!fees && feesEmpty(fees.series)"
              :empty-text="t('dashboard.charts.fees.empty')" :summary="t('dashboard.charts.fees.summary')" has-table @retry="loadCharts">
              <div class="fee-blocks">
                <div v-for="b in blocks" :key="b.currency" class="fee-block" :data-currency="b.currency" data-testid="fee-block">
                  <div class="fee-head"><strong>{{ t(`fees.currency.${b.currency}`) }}</strong><span class="text-muted">{{ t('dashboard.charts.fees.total', { amount: b.total }) }}</span></div>
                  <BarRows :rows="b.rows" :max="b.max" :label="`${t('dashboard.charts.fees.title')} ${b.currency}`" :animate="animate" start="last" />
                </div>
              </div>
              <template #table>
                <div v-for="b in blocks" :key="b.currency" class="mb-3">
                  <h3 class="h6">{{ t(`fees.currency.${b.currency}`) }}</h3>
                  <ChartTable :caption="`${t('dashboard.charts.fees.title')} ${b.currency}`" :data="b.table" />
                </div>
              </template>
            </ChartCard>
          </div>
        </div>
      </section>

      <div class="row g-3">
        <div class="col-lg-4">
          <div class="card h-100 dash-card">
            <div class="card-header"><AppIcon name="calendar3" class="me-2" />{{ t('dashboard.currentYear') }}</div>
            <div class="card-body">
              <StateBlock :loading="years === null">
                <template v-if="currentYear">
                  <div class="fs-4 fw-semibold">{{ currentYear.nameKm }}</div>
                  <div class="text-muted">{{ formatDateKm(currentYear.startDate) }} - {{ formatDateKm(currentYear.endDate) }}</div>
                </template>
                <span v-else class="text-muted">{{ t('dashboard.noYear') }}</span>
              </StateBlock>
            </div>
          </div>
        </div>

        <template v-if="dashboard">
          <div class="col-lg-4">
            <div class="card h-100 dash-card" data-testid="recent-exams">
              <div class="card-header"><AppIcon name="journal-text" class="me-2" />{{ t('dashboard.recentExams') }}</div>
              <div class="card-body">
                <p v-if="dashboard.recentExams.length === 0" class="text-muted mb-0">{{ t('dashboard.noExams') }}</p>
                <ul v-else class="list-unstyled mb-0">
                  <li v-for="e in dashboard.recentExams" :key="e.id" class="d-flex gap-2 mb-1">
                    <NuxtLink :to="`/exams/${e.id}`" class="me-auto">{{ e.nameKm }}</NuxtLink>
                    <span class="text-muted small">{{ examKindLabel(e.kind) }} · {{ t('dashboard.scoresEntered', { n: e.scoreCount }) }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div class="col-lg-4"><EventsCard :events="dashboard.events" @changed="loadDashboard" /></div>
          <div v-if="dashboard.fees" class="col-lg-4">
            <div class="card h-100 dash-card" data-testid="fees-outstanding">
              <div class="card-header"><AppIcon name="cash-coin" class="me-2" />{{ t('dashboard.feesOutstanding') }}</div>
              <div class="card-body">
                <p v-if="dashboard.fees.outstanding.length === 0" class="text-muted mb-0">{{ t('dashboard.feesNone') }}</p>
                <div v-for="total in dashboard.fees.outstanding" :key="total.currency" class="fs-4 fw-semibold">{{ formatMoney(total.balance, total.currency) }}</div>
                <NuxtLink to="/fees" class="small">{{ t('nav.fees') }}</NuxtLink>
              </div>
            </div>
          </div>
        </template>
      </div>
    </StateBlock>
  </div>
</template>
