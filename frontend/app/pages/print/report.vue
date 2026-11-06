<script setup lang="ts">
import { type ReportName, REPORT_NAMES, useReportTable } from '~/composables/useReportTable';
import { printCurrentPage, saveFile, savePdfOfCurrentPage } from '~/services/desktop';
import { reportsApi } from '~/services/reportsApi';
import { useSchoolStore } from '~/stores/school';
import type { ReportCell, ReportColumn, ReportTable } from '~/types/api';
import { formatDateKm, formatLongDateKm } from '~/utils/date';
import { formatNumber } from '~/utils/score';
import { CELL_SEPARATOR } from '~/utils/timetable';
import { breakRowName } from '~/utils/timetableTables';

// Any report as a printable A4 table. What to show comes from the address (?name=results&classId=3&examId=5 ...); the same table can be
// saved as an Excel file from here. Wide tables are set in a smaller type so they still fit the width of the page.
definePageMeta({ layout: 'print' });

const { t } = useI18n();
const route = useRoute();
const school = useSchoolStore();
const notify = useNotify();
const { messageFor } = useApiError();
const { build } = useReportTable();

const number = (value: unknown): number | null => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isInteger(n) && n > 0 ? n : null;
};
const name = (REPORT_NAMES as readonly string[]).includes(String(route.query.name)) ? (String(route.query.name) as ReportName) : null;
const params = {
  yearId: number(route.query.yearId),
  classId: number(route.query.classId),
  examId: number(route.query.examId),
  // the homework reports: one assignment, or a subject to limit the list and the summary to
  homeworkId: number(route.query.homeworkId),
  subjectId: number(route.query.subjectId),
  // the timetable reports: one teacher (with yearId) or one student's class
  teacherId: number(route.query.teacherId),
  studentId: number(route.query.studentId),
  from: String(route.query.from ?? ''),
  to: String(route.query.to ?? ''),
  status: String(route.query.status ?? ''),
  // attendance only: counted by days or by sessions (the official method when the address does not say)
  basis: route.query.basis === 'SESSION' ? ('SESSION' as const) : route.query.basis === 'DAY' ? ('DAY' as const) : undefined,
};

// A timetable is portrait A4 unless the person asks for landscape (seven days in portrait can get small); the page that sent us says where Back goes.
const isTimetable = name === 'timetableClass' || name === 'timetableTeacher' || name === 'timetableStudent';
const backPath = typeof route.query.back === 'string' && route.query.back.startsWith('/') && !route.query.back.startsWith('//') ? route.query.back : '/reports';
const landscape = ref(route.query.landscape === '1');
const ORIENTATION_STYLE_ID = 'print-page-orientation';
/** The print pipeline honours the page's own @page size (preferCSSPageSize), so landscape is one rule added to the document; leaving the page removes it. */
function applyOrientation(on: boolean): void {
  document.getElementById(ORIENTATION_STYLE_ID)?.remove();
  if (!on) return;
  const style = document.createElement('style');
  style.id = ORIENTATION_STYLE_ID;
  style.textContent = '@page { size: A4 landscape; }';
  document.head.appendChild(style);
}
const lines = (text: string): string[] => text.split(CELL_SEPARATOR);

const order = ref<'rank' | 'name'>(route.query.order === 'name' ? 'name' : 'rank');
const table = ref<ReportTable | null>(null);
const error = ref<string | null>(null);
const busy = ref<'print' | 'pdf' | 'excel' | null>(null);

const issued = computed(() => formatLongDateKm(new Date()));
const sizeClass = computed(() => ((table.value?.columns.length ?? 0) > 12 ? 'report-sheet-wide' : (table.value?.columns.length ?? 0) > 8 ? 'report-sheet-medium' : ''));

async function load(): Promise<void> {
  if (!name) {
    error.value = t('error.BAD_REQUEST');
    return;
  }
  error.value = null;
  try {
    table.value = await build(name, { ...params, order: order.value });
  } catch (e) {
    error.value = messageFor(e);
  }
}

function show(value: ReportCell, column: ReportColumn): string {
  if (value === null || value === '') return '';
  if (column.type === 'DATE') return formatDateKm(String(value));
  if (column.type === 'DECIMAL' && typeof value === 'number') return formatNumber(value);
  return String(value);
}

async function back(): Promise<void> {
  await navigateTo(backPath);
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
    const result = await savePdfOfCurrentPage(`${table.value?.sheetName ?? 'report'}.pdf`);
    if (result.saved) notify.success(t('print.pdfSaved'));
  } catch {
    notify.error(t('print.failed'));
  } finally {
    busy.value = null;
  }
}

async function exportExcel(): Promise<void> {
  if (!table.value) return;
  busy.value = 'excel';
  try {
    const result = await saveFile(`${table.value.sheetName}.xlsx`, await reportsApi.exportTable(table.value));
    if (result.saved) notify.success(t('students.exported'));
  } catch (e) {
    notify.error(messageFor(e));
  } finally {
    busy.value = null;
  }
}

watch(order, load);
onMounted(() => {
  watch(landscape, applyOrientation, { immediate: true });
  load();
});
onBeforeUnmount(() => applyOrientation(false));
</script>

<template>
  <div>
    <div class="print-toolbar no-print">
      <button type="button" class="btn btn-outline-secondary" @click="back"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null || !table" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null || !table" @click="savePdf">{{ t('print.savePdf') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-excel" :loading="busy === 'excel'" :disabled="busy !== null || !table" @click="exportExcel">{{ t('reports.excel') }}</LoadingButton>
      <div v-if="isTimetable" class="form-check form-switch mb-0">
        <input id="print-landscape" v-model="landscape" type="checkbox" role="switch" class="form-check-input" data-testid="print-landscape" />
        <label for="print-landscape" class="form-check-label">{{ t('timetable.print.landscape') }}</label>
      </div>
      <template v-if="name === 'results'">
        <label for="results-order" class="visually-hidden">{{ t('reports.results.order') }}</label>
        <select id="results-order" v-model="order" class="form-select report-order">
          <option value="rank">{{ t('reports.results.byRank') }}</option>
          <option value="name">{{ t('reports.results.byName') }}</option>
        </select>
      </template>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <article v-if="table" class="print-sheet student-sheet report-sheet" :class="[sizeClass, { 'report-timetable': isTimetable, 'is-landscape': landscape }]" lang="km" data-testid="report-sheet">
      <PrintHeader />
      <h1 class="student-sheet-title">{{ table.title }}</h1>
      <p v-if="table.subtitle" class="report-sub">{{ table.subtitle }}</p>

      <p v-if="table.rows.length === 0" class="student-sheet-none">{{ t('common.empty') }}</p>
      <table v-else class="student-sheet-grid report-table">
        <thead>
          <tr>
            <th v-for="(column, c) in table.columns" :key="c" :class="{ 'report-num': column.type === 'INTEGER' || column.type === 'DECIMAL' }">{{ column.label }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, r) in table.rows" :key="r">
            <!-- a timetable: a break is one shaded band, and a cell shows its lines (the subject, then the teacher or class) one under the other -->
            <tr v-if="isTimetable && breakRowName(row) !== null" class="tt-print-break" data-testid="report-break-row">
              <th class="tt-print-time" scope="row"><template v-for="(line, i) in lines(show(row[0] ?? null, table.columns[0] as ReportColumn))" :key="i"><br v-if="i > 0" />{{ line }}</template></th>
              <td :colspan="table.columns.length - 1" class="tt-print-break-cell">{{ breakRowName(row) }}</td>
            </tr>
            <tr v-else-if="isTimetable">
              <th class="tt-print-time" scope="row"><template v-for="(line, i) in lines(show(row[0] ?? null, table.columns[0] as ReportColumn))" :key="i"><br v-if="i > 0" />{{ line }}</template></th>
              <td v-for="(column, c) in table.columns.slice(1)" :key="c" class="tt-print-cell"><template v-for="(line, i) in lines(show(row[c + 1] ?? null, column))" :key="i"><br v-if="i > 0" />{{ line }}</template></td>
            </tr>
            <tr v-else>
              <td v-for="(column, c) in table.columns" :key="c" :class="{ 'report-num': column.type === 'INTEGER' || column.type === 'DECIMAL' }">{{ show(row[c] ?? null, column) }}</td>
            </tr>
          </template>
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
