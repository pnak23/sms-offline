<script setup lang="ts">
import { attendanceApi } from '~/services/attendanceApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { AcademicYear, EnrollmentHistory, StudentAttendance } from '~/types/api';
import { formatDateKm, todayIso } from '~/utils/date';

// A student's attendance in the academic year of their current (or latest) class: the totals and the most recent days.
const props = defineProps<{ studentId: number; enrollments: EnrollmentHistory[]; years: AcademicYear[] }>();

const RECENT = 10;
const { t } = useI18n();
const { messageFor } = useApiError();
const { attendanceStatusLabel } = useLabels();
const preferences = usePreferencesStore();

const data = ref<StudentAttendance | null>(null);
const loadError = ref<string | null>(null);
const loading = ref(true);

const enrollment = computed(() => props.enrollments.find((e) => e.status === 'ACTIVE') ?? props.enrollments[0] ?? null);
/** The badges follow the school's official method: days (a student with two sessions is one day) or sessions; both counts are always written beside them. */
const badges = computed(() => {
  const d = data.value;
  if (!d) return [];
  return preferences.attendanceBasis === 'DAY'
    ? [['PRESENT', 'success', d.days.present], ['LATE', 'warning', d.days.late], ['PARTIAL', 'secondary', d.days.partial], ['ABSENT', 'danger', d.days.absent], ['LEAVE', 'info', d.days.leave]]
    : [['PRESENT', 'success', d.present], ['ABSENT', 'danger', d.absent], ['LATE', 'warning', d.late], ['LEAVE', 'info', d.leave]];
});
const year = computed(() => props.years.find((y) => y.id === enrollment.value?.academicYearId) ?? null);

async function load(): Promise<void> {
  loadError.value = null;
  data.value = null;
  const y = year.value;
  if (!y) {
    loading.value = false;
    return;
  }
  const to = todayIso() < y.endDate ? todayIso() : y.endDate;
  try {
    data.value = y.startDate <= to ? await attendanceApi.forStudent(props.studentId, y.startDate, to) : { rows: [], present: 0, absent: 0, late: 0, leave: 0, total: 0, days: { present: 0, late: 0, partial: 0, absent: 0, leave: 0, total: 0 } };
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="card mt-3" data-testid="student-attendance">
    <div class="card-body">
      <h2 class="h5">{{ t('students.attendanceTitle') }}<span v-if="year" class="text-muted fs-6"> · {{ year.nameKm }}</span></h2>
      <StateBlock :loading="loading" :error="loadError" @retry="load">
        <p v-if="!year || !data || data.total === 0" class="text-muted mb-0">{{ t('students.noAttendance') }}</p>
        <template v-else>
          <p class="mb-1" data-testid="student-attendance-badges">
            <span v-for="[code, colour, n] in badges" :key="code" :class="`badge text-bg-${colour} me-1`">{{ attendanceStatusLabel(String(code)) }} {{ n }}</span>
            <span class="text-muted">{{ t(`attendance.basis.${preferences.attendanceBasis}`) }}</span>
          </p>
          <p class="small text-muted mb-2" data-testid="student-attendance-both">{{ t('students.attendanceBoth', { days: data.days.total, sessions: data.total }) }}</p>
          <div class="table-responsive scroll-x">
            <table class="table table-sm mb-0">
              <thead>
                <tr>
                  <th>{{ t('attendance.date') }}</th>
                  <th>{{ t('attendance.session') }}</th>
                  <th>{{ t('attendance.statusColumn') }}</th>
                  <th>{{ t('attendance.remark') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in data.rows.slice(0, RECENT)" :key="i">
                  <td class="text-nowrap">{{ formatDateKm(row.date) }}</td>
                  <td>{{ row.periodNameKm }}</td>
                  <td>{{ attendanceStatusLabel(row.status) }}</td>
                  <td>{{ row.remark ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </StateBlock>
    </div>
  </div>
</template>
