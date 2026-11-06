<script setup lang="ts">
import { printCurrentPage, savePdfOfCurrentPage } from '~/services/desktop';
import { studentsApi } from '~/services/studentsApi';
import { useSchoolStore } from '~/stores/school';
import type { StudentDetail } from '~/types/api';
import { formatDateKm, formatLongDateKm } from '~/utils/date';

// The printable student profile (A4): school header, photo, personal details, guardians, class history, signature line.
definePageMeta({ layout: 'print' });

const { t } = useI18n();
const route = useRoute();
const school = useSchoolStore();
const notify = useNotify();
const { messageFor } = useApiError();
const { genderLabel, relationshipLabel, studentStatusLabel, enrollmentStatusLabel } = useLabels();

const id = Number(route.params.id);
const detail = ref<StudentDetail | null>(null);
const photoUrl = ref<string | null>(null);
const error = ref<string | null>(null);
const busy = ref<'print' | 'pdf' | null>(null);

const student = computed(() => detail.value?.student ?? null);
const issued = computed(() => formatLongDateKm(new Date()));
const residence = computed(() => [student.value?.address, student.value?.village, student.value?.commune, student.value?.district, student.value?.province].filter(Boolean).join(' · '));

onMounted(async () => {
  try {
    detail.value = await studentsApi.get(id);
    const file = detail.value.student.photoFile;
    if (file) photoUrl.value = URL.createObjectURL(await studentsApi.photoBlob(file));
  } catch (e) {
    error.value = messageFor(e);
  }
});
onBeforeUnmount(() => {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value);
});

async function back(): Promise<void> {
  await navigateTo(`/students/${id}`);
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
    const result = await savePdfOfCurrentPage(`${student.value?.studentCode ?? 'student'}.pdf`);
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
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null || !student" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null || !student" @click="savePdf">
        {{ t('print.savePdf') }}
      </LoadingButton>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <article v-if="student && detail" class="print-sheet student-sheet" lang="km">
      <PrintHeader />

      <h1 class="student-sheet-title">{{ t('print.student.title') }}</h1>

      <div class="student-sheet-top">
        <table class="student-sheet-table">
          <tbody>
            <tr><th>{{ t('students.code') }}</th><td>{{ student.studentCode }}</td></tr>
            <tr><th>{{ t('students.nameKm') }}</th><td class="fw-semibold">{{ student.nameKm }}</td></tr>
            <tr><th>{{ t('students.nameEn') }}</th><td>{{ student.nameEn ?? '—' }}</td></tr>
            <tr><th>{{ t('common.gender') }}</th><td>{{ genderLabel(student.gender) }}</td></tr>
            <tr><th>{{ t('students.dateOfBirth') }}</th><td>{{ formatDateKm(student.dateOfBirth) }}</td></tr>
            <tr><th>{{ t('students.placeOfBirth') }}</th><td>{{ student.placeOfBirth ?? '—' }}</td></tr>
            <tr><th>{{ t('common.address') }}</th><td>{{ residence || '—' }}</td></tr>
            <tr><th>{{ t('students.enrollmentDate') }}</th><td>{{ formatDateKm(student.enrollmentDate) }}</td></tr>
            <tr><th>{{ t('common.status') }}</th><td>{{ studentStatusLabel(student.status) }}</td></tr>
          </tbody>
        </table>
        <div class="student-sheet-photo">
          <img v-if="photoUrl" :src="photoUrl" :alt="t('students.photoAlt', { name: student.nameKm })" />
          <span v-else>{{ t('print.student.photo') }}</span>
        </div>
      </div>

      <h2 class="student-sheet-heading">{{ t('students.sectionGuardians') }}</h2>
      <p v-if="detail.guardians.length === 0" class="student-sheet-none">{{ t('students.noGuardians') }}</p>
      <table v-else class="student-sheet-grid">
        <thead><tr><th>{{ t('students.guardianName') }}</th><th>{{ t('students.relationship') }}</th><th>{{ t('common.phone') }}</th></tr></thead>
        <tbody>
          <tr v-for="g in detail.guardians" :key="g.id">
            <td>{{ g.nameKm }}{{ g.primary ? ` (${t('students.primaryGuardian')})` : '' }}</td>
            <td>{{ relationshipLabel(g.relationship) }}</td>
            <td>{{ g.phone ?? '—' }}</td>
          </tr>
        </tbody>
      </table>

      <h2 class="student-sheet-heading">{{ t('students.historyTitle') }}</h2>
      <p v-if="detail.enrollments.length === 0" class="student-sheet-none">{{ t('students.noHistory') }}</p>
      <table v-else class="student-sheet-grid">
        <thead><tr><th>{{ t('classes.year') }}</th><th>{{ t('students.class') }}</th><th>{{ t('common.status') }}</th><th>{{ t('students.move.date') }}</th></tr></thead>
        <tbody>
          <tr v-for="e in detail.enrollments" :key="e.enrollmentId">
            <td>{{ e.yearName }}</td>
            <td>{{ e.gradeName }} {{ e.className }}</td>
            <td>{{ enrollmentStatusLabel(e.status) }}</td>
            <td>{{ formatDateKm(e.enrolledOn) }}{{ e.leftOn ? ` → ${formatDateKm(e.leftOn)}` : '' }}</td>
          </tr>
        </tbody>
      </table>

      <footer class="student-sheet-footer">
        <div>{{ t('print.student.date', { date: issued }) }}</div>
        <div class="student-sheet-signature">
          <span class="signature-line" />
          <span>{{ t('print.student.director') }}{{ school.profile?.directorName ? `: ${school.profile.directorName}` : '' }}</span>
        </div>
      </footer>
    </article>
  </div>
</template>
