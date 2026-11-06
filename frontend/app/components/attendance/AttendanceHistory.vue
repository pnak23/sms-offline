<script setup lang="ts">
import { attendanceApi } from '~/services/attendanceApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { AttendanceBasis, AttendanceDay, AttendanceSession, AttendanceSummaryRow } from '~/types/api';
import { ATTENDANCE_BASES, columnLabels, countsOf, recordedDays } from '~/utils/attendance';
import { formatDateKm, monthStartIso, toIsoDate, todayIso } from '~/utils/date';
import { sortByKhmer } from '~/utils/sort';

// What was recorded for a class over a period, counted EITHER way: by days (each date once: a student present in the morning and absent in the
// afternoon is one partial day) or by sessions (every sheet). The view starts on the school's official method and the other is one click away;
// every heading and column says its unit (ថ្ងៃ or វគ្គ).
const props = defineProps<{ classId: number | null }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const preferences = usePreferencesStore();

const basis = ref<AttendanceBasis>(preferences.attendanceBasis);
watch(() => preferences.attendanceBasis, (official) => { basis.value = official; });   // the settings may arrive after this page opened
const from = ref(monthStartIso());
const to = ref(todayIso());
const summary = ref<AttendanceSummaryRow[]>([]);
const sessions = ref<AttendanceSession[]>([]);
const days = ref<AttendanceDay[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

const validRange = computed(() => toIsoDate(from.value) !== null && toIsoDate(to.value) !== null && from.value <= to.value);
const labels = computed(() => columnLabels(t, basis.value));
const unit = computed(() => t(`attendance.unit.${basis.value}`));
const recorded = computed(() => (basis.value === 'DAY' ? recordedDays(sessions.value) : sessions.value.length));

async function load(): Promise<void> {
  summary.value = [];
  sessions.value = [];
  days.value = [];
  loadError.value = null;
  if (props.classId === null || !validRange.value) return;
  const classId = props.classId;
  loading.value = true;
  try {
    const [s, d, byDate] = await Promise.all([
      attendanceApi.summary(classId, from.value, to.value),
      attendanceApi.sessions(classId, from.value, to.value),
      attendanceApi.days(classId, from.value, to.value),
    ]);
    if (props.classId === classId) {
      summary.value = sortByKhmer(s, (row) => row.nameKm);
      sessions.value = d;
      days.value = byDate;
    }
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

const printLink = computed(() => `/print/attendance?classId=${props.classId}&from=${from.value}&to=${to.value}&basis=${basis.value}`);

watch([() => props.classId, from, to], load);
onMounted(load);
</script>

<template>
  <div>
    <div class="filter-bar">
      <div>
        <label for="history-from" class="visually-hidden">{{ t('attendance.from') }}</label>
        <input id="history-from" v-model="from" type="date" class="form-control" :max="to" />
      </div>
      <span aria-hidden="true">→</span>
      <div>
        <label for="history-to" class="visually-hidden">{{ t('attendance.to') }}</label>
        <input id="history-to" v-model="to" type="date" class="form-control" :min="from" />
      </div>
      <div class="btn-group" role="group" :aria-label="t('attendance.basis.label')" data-testid="history-basis">
        <template v-for="b in ATTENDANCE_BASES" :key="b">
          <input :id="`history-basis-${b}`" v-model="basis" type="radio" class="btn-check" name="history-basis" :value="b" autocomplete="off" />
          <label class="btn btn-outline-primary" :for="`history-basis-${b}`" :data-basis="b">
            {{ t(`attendance.basis.${b}`) }}<span v-if="preferences.attendanceBasis === b" class="session-times">{{ t('attendance.basis.official') }}</span>
          </label>
        </template>
      </div>
      <NuxtLink v-if="classId !== null && validRange" :to="printLink" class="btn btn-outline-secondary ms-auto" data-testid="history-print"><AppIcon name="printer" />{{ t('attendance.printSummary') }}</NuxtLink>
    </div>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <p v-if="classId === null" class="text-muted mb-0">{{ t('attendance.chooseClass') }}</p>
      <p v-else-if="!validRange" class="text-danger mb-0">{{ t('attendance.badRange') }}</p>
      <p v-else-if="sessions.length === 0" class="text-muted mb-0">{{ t('attendance.noneInPeriod') }}</p>
      <template v-else>
        <p class="small text-muted" data-testid="history-recorded">{{ t(basis === 'DAY' ? 'attendance.recordedDays' : 'attendance.recordedSessions', { n: recorded }) }}</p>
        <h2 class="h6">{{ t('attendance.summaryTitle') }} · {{ unit }}</h2>
        <div class="table-responsive scroll-x mb-4">
          <table class="table table-hover align-middle mb-0" data-testid="history-summary">
            <thead>
              <tr>
                <th>{{ t('students.code') }}</th>
                <th>{{ t('students.nameKm') }}</th>
                <th v-for="(label, i) in labels" :key="i" class="text-end">{{ label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in summary" :key="row.enrollmentId" data-testid="history-summary-row" :data-student="row.studentCode">
                <td class="text-nowrap">{{ row.studentCode }}</td>
                <td class="fw-medium">{{ row.nameKm }}</td>
                <td v-for="(n, i) in countsOf(row, basis)" :key="i" class="text-end" :class="{ 'text-danger fw-semibold': n > 0 && (basis === 'DAY' ? i === 3 : i === 1) }">{{ n }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 class="h6">{{ t('attendance.daysTitle') }} · {{ unit }}</h2>
        <div v-if="basis === 'DAY'" class="table-responsive scroll-x">
          <table class="table table-hover align-middle mb-0" data-testid="history-days">
            <thead>
              <tr>
                <th>{{ t('attendance.date') }}</th>
                <th class="text-end">{{ t('attendance.sheetsTaken') }}</th>
                <th v-for="code in ['PRESENT', 'LATE', 'PARTIAL', 'ABSENT', 'LEAVE']" :key="code" class="text-end">{{ t(`attendance.status.${code}`) }}</th>
                <th class="text-end">{{ t('attendance.students') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in days" :key="d.date" data-testid="history-day">
                <td class="text-nowrap">{{ formatDateKm(d.date) }}</td>
                <td class="text-end">{{ d.sheets }}</td>
                <td class="text-end">{{ d.present }}</td>
                <td class="text-end">{{ d.late }}</td>
                <td class="text-end">{{ d.partial }}</td>
                <td class="text-end">{{ d.absent }}</td>
                <td class="text-end">{{ d.leave }}</td>
                <td class="text-end">{{ d.students }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="table-responsive scroll-x">
          <table class="table table-hover align-middle mb-0" data-testid="history-sessions">
            <thead>
              <tr>
                <th>{{ t('attendance.date') }}</th>
                <th>{{ t('attendance.session') }}</th>
                <th class="text-end">{{ t('attendance.status.PRESENT') }}</th>
                <th class="text-end">{{ t('attendance.status.ABSENT') }}</th>
                <th class="text-end">{{ t('attendance.status.LATE') }}</th>
                <th class="text-end">{{ t('attendance.status.LEAVE') }}</th>
                <th class="text-end">{{ t('attendance.total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sessions" :key="s.sessionId" data-testid="history-day">
                <td class="text-nowrap">{{ formatDateKm(s.date) }}</td>
                <td data-testid="history-session">{{ s.periodNameKm }}</td>
                <td class="text-end">{{ s.present }}</td>
                <td class="text-end">{{ s.absent }}</td>
                <td class="text-end">{{ s.late }}</td>
                <td class="text-end">{{ s.leave }}</td>
                <td class="text-end">{{ s.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </StateBlock>
  </div>
</template>
