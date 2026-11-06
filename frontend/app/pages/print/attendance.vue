<script setup lang="ts">
import { attendanceApi } from '~/services/attendanceApi';
import { classesApi } from '~/services/classesApi';
import { printCurrentPage, savePdfOfCurrentPage } from '~/services/desktop';
import { usePreferencesStore } from '~/stores/preferences';
import type { AttendanceSession, AttendanceSummaryRow, ClassDto } from '~/types/api';
import { columnLabels, countsOf, recordedDays } from '~/utils/attendance';
import { formatDateKm, formatLongDateKm } from '~/utils/date';
import { sortByKhmer } from '~/utils/sort';

// The printable attendance summary of one class over a period (A4): who was present, absent, late, partial or on leave, counted by DAYS or by SESSIONS
// (?basis=DAY|SESSION; the school's official method when the address does not say), with the unit in every column heading.
definePageMeta({ layout: 'print' });

const { t } = useI18n();
const route = useRoute();
const notify = useNotify();
const { messageFor } = useApiError();
const preferences = usePreferencesStore();

const classId = Number(route.query.classId);
const from = String(route.query.from ?? '');
const to = String(route.query.to ?? '');
const basis = route.query.basis === 'SESSION' ? 'SESSION' : route.query.basis === 'DAY' ? 'DAY' : preferences.attendanceBasis;
const labels = columnLabels(t, basis);

const schoolClass = ref<ClassDto | null>(null);
const summary = ref<AttendanceSummaryRow[]>([]);
const sessions = ref<AttendanceSession[]>([]);
const error = ref<string | null>(null);
const busy = ref<'print' | 'pdf' | null>(null);

const issued = computed(() => formatLongDateKm(new Date()));

onMounted(async () => {
  try {
    const [detail, s, d] = await Promise.all([classesApi.get(classId), attendanceApi.summary(classId, from, to), attendanceApi.sessions(classId, from, to)]);
    schoolClass.value = detail.schoolClass;
    summary.value = sortByKhmer(s, (row) => row.nameKm);
    sessions.value = d;
  } catch (e) {
    error.value = messageFor(e);
  }
});

async function back(): Promise<void> {
  await navigateTo('/attendance');
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
    const result = await savePdfOfCurrentPage(`attendance-${from}-${to}.pdf`);
    if (result.saved) notify.success(t('print.pdfSaved'));
  } catch {
    notify.error(t('print.failed'));
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <div class="print-toolbar no-print">
      <button type="button" class="btn btn-outline-secondary" @click="back"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null || !schoolClass" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null || !schoolClass" @click="savePdf">
        {{ t('print.savePdf') }}
      </LoadingButton>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <!-- uses the student sheet's header / grid / footer styles -->
    <article v-if="schoolClass" class="print-sheet student-sheet" lang="km">
      <PrintHeader />

      <h1 class="student-sheet-title">{{ t('print.attendance.title') }}</h1>
      <p class="mb-3">
        {{ schoolClass.gradeName }} {{ schoolClass.nameKm }} · {{ schoolClass.yearName }}<br />
        {{ t(basis === 'DAY' ? 'print.attendance.period' : 'print.attendance.periodSessions', { from: formatDateKm(from), to: formatDateKm(to), days: recordedDays(sessions), sessions: sessions.length }) }}<br />
        <span data-testid="print-basis">{{ t(`attendance.basis.${basis}`) }}</span>
      </p>

      <p v-if="summary.length === 0" class="student-sheet-none">{{ t('attendance.noStudents') }}</p>
      <table v-else class="student-sheet-grid">
        <thead>
          <tr>
            <th>{{ t('print.attendance.number') }}</th>
            <th>{{ t('students.code') }}</th>
            <th>{{ t('students.nameKm') }}</th>
            <th v-for="(label, i) in labels" :key="i">{{ label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in summary" :key="row.enrollmentId">
            <td>{{ index + 1 }}</td>
            <td>{{ row.studentCode }}</td>
            <td>{{ row.nameKm }}</td>
            <td v-for="(n, i) in countsOf(row, basis)" :key="i">{{ n }}</td>
          </tr>
        </tbody>
      </table>

      <footer class="student-sheet-footer">
        <div>{{ t('print.student.date', { date: issued }) }}</div>
        <div class="student-sheet-signature">
          <span class="signature-line" />
          <span>{{ t('print.attendance.teacher') }}</span>
        </div>
      </footer>
    </article>
  </div>
</template>
