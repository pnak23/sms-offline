<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { useSchoolStore } from '~/stores/school';
import { useSessionStore } from '~/stores/session';
import type { AcademicYear } from '~/types/api';
import type { SetupTask } from '~/types/ui';
import { findCheck, needsAttention } from '~/utils/health';

const { t } = useI18n();
const { messageFor } = useApiError();
const session = useSessionStore();
const school = useSchoolStore();
const health = useHealthReport();

const years = ref<AcademicYear[] | null>(null);
const loadError = ref<string | null>(null);

const currentYear = computed(() => years.value?.find((y) => y.current) ?? null);
const backupCheck = computed(() => findCheck(health.report.value, 'BACKUP_AGE'));
const showBackupBanner = computed(() => backupCheck.value?.status === 'WARN');
const showHealthChip = computed(() => !!health.status.value && needsAttention(health.status.value));

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

async function load(): Promise<void> {
  loadError.value = null;
  const [, yearResult] = await Promise.allSettled([
    health.run('quick'),
    academicApi.years().then((list) => {
      years.value = list;
    }),
    school.profile ? Promise.resolve() : school.load(),
  ]);
  if (yearResult.status === 'rejected') loadError.value = messageFor(yearResult.reason);
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <div class="card mb-3 greeting-card">
      <div class="card-body d-flex align-items-start gap-3">
        <div class="flex-grow-1">
          <h1 class="mb-1">{{ t('dashboard.greeting', { name: session.user?.displayName ?? '' }) }}</h1>
          <p v-if="school.hasName" class="mb-0 fs-5">{{ school.name }}</p>
          <p v-else-if="school.profile" class="mb-0 text-muted">
            {{ t('dashboard.noSchoolName') }}
            <NuxtLink to="/settings/school">{{ t('dashboard.completeProfile') }}</NuxtLink>
          </p>
        </div>
        <HealthChip v-if="showHealthChip && health.status.value" :status="health.status.value" />
      </div>
    </div>

    <BackupBanner v-if="showBackupBanner && backupCheck" :check="backupCheck" />

    <StateBlock :error="loadError" @retry="load">
      <div class="row g-3">
        <div class="col-lg-5">
          <div class="card h-100">
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
        <div v-if="tasks.length" class="col-lg-7"><SetupTasksCard :tasks="tasks" /></div>
      </div>
    </StateBlock>
  </div>
</template>
