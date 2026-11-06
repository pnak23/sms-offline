<script setup lang="ts">
import { ATTENDANCE_STATUSES } from '~/composables/useLabels';
import { attendanceApi } from '~/services/attendanceApi';
import { attendancePeriodsApi } from '~/services/attendancePeriodsApi';
import { useAttendanceChoiceStore } from '~/stores/attendanceChoice';
import type { AcademicYear, AttendanceEntry, AttendancePeriod, AttendancePeriodRef, AttendanceSheet, AttendanceStatus } from '~/types/api';
import { periodLabel } from '~/utils/attendance';
import { formatDateKm, todayIso } from '~/utils/date';
import { sortByKhmer } from '~/utils/sort';

// Take (or correct) the attendance of one class for one day and one session of the school day: one choice per student, everybody present with
// one click. The sessions are the administrator's (Settings → Attendance sessions); when the school has only one, no choice is shown.
// Changing the class, the day or the session while there are unsaved choices asks first, so nothing typed is lost by accident.
const classId = defineModel<number | null>('classId', { required: true });
const props = defineProps<{ closed: boolean; year: AcademicYear | null }>();

interface RowState {
  enrollmentId: number;
  studentCode: string;
  nameKm: string;
  status: AttendanceStatus | '';
  remark: string;
}

const STATUS_STYLE: Record<AttendanceStatus, string> = { PRESENT: 'success', ABSENT: 'danger', LATE: 'warning', LEAVE: 'info' };

const { t } = useI18n();
const notify = useNotify();
const { messageFor } = useApiError();
const { attendanceStatusLabel } = useLabels();
const submit = useSubmit({ fields: [] });
const choice = useAttendanceChoiceStore();

const date = ref(todayIso());
const periods = ref<AttendancePeriod[]>([]);
const periodsYear = ref<number | null | undefined>(undefined);   // which year `periods` belongs to (undefined: not loaded yet)
const periodId = ref<number | null>(null);
const sheetPeriod = ref<AttendancePeriodRef | null>(null);
const recordedIds = ref<number[]>([]);
const copyChoice = ref<number | null>(null);
const rows = ref<RowState[]>([]);
const note = ref('');
const loading = ref(false);
const loadError = ref<string | null>(null);
const recorded = ref(false);
const confirmOpen = ref(false);
const applied = { classId: null as number | null, date: '', periodId: null as number | null };
let baseline = '';

// Days outside the academic year can be recorded, but the report cards only count the days of the year: say so before it is a surprise.
const outsideYear = computed(() => !!props.year && !!date.value && (date.value < props.year.startDate || date.value > props.year.endDate));

const snapshot = () => JSON.stringify([rows.value.map((r) => [r.enrollmentId, r.status, r.remark]), note.value]);
const dirty = computed(() => rows.value.length > 0 && snapshot() !== baseline);
const counts = computed(() => {
  const out: Record<AttendanceStatus | 'unmarked', number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, unmarked: 0 };
  for (const row of rows.value) out[row.status === '' ? 'unmarked' : row.status] += 1;
  return out;
});

// What the buttons offer: the sessions that are switched on, plus one that is switched off but already has a sheet (or is open on screen), so it can still be read and corrected.
const choices = computed(() => periods.value.filter((p) => p.enabled || p.id === periodId.value || recordedIds.value.includes(p.id)));
const noSession = computed(() => periods.value.length > 0 && !periods.value.some((p) => p.enabled) && periodId.value === null);
const copySources = computed(() => periods.value.filter((p) => p.id !== periodId.value && recordedIds.value.includes(p.id)));
const livePeriod = computed(() => periods.value.find((p) => p.id === periodId.value) ?? null);
/** The sheet was saved under another name than the session has now (it keeps its own, so history never changes). */
const savedAsOther = computed(() => !!sheetPeriod.value && !!livePeriod.value && recorded.value && sheetPeriod.value.nameKm !== livePeriod.value.nameKm);


function adopt(sheet: AttendanceSheet): void {
  rows.value = sortByKhmer(sheet.rows, (r) => r.nameKm).map((r) => ({ enrollmentId: r.enrollmentId, studentCode: r.studentCode, nameKm: r.nameKm, status: r.status ?? '', remark: r.remark ?? '' }));
  note.value = sheet.note ?? '';
  recorded.value = sheet.sessionId !== null;
  sheetPeriod.value = sheet.period;
  recordedIds.value = sheet.recordedPeriodIds;
  copyChoice.value = null;
  baseline = snapshot();
}

/** The sessions of the academic year on screen, and which one to start on: the last one used there if it is still switched on, else the first switched-on one. */
async function loadPeriods(): Promise<void> {
  const yearId = props.year?.id ?? null;
  periodsYear.value = yearId;
  periods.value = yearId === null ? [] : await attendancePeriodsApi.list(yearId);
  const last = choice.last(yearId);   // the session used last in this year (in memory: the program stores nothing in the browser)
  const start = periods.value.find((p) => p.id === last && p.enabled) ?? periods.value.find((p) => p.enabled) ?? null;
  periodId.value = start?.id ?? null;
  applied.periodId = periodId.value;   // choosing the starting session is not a change the user made
}

async function load(): Promise<void> {
  const target = { classId: classId.value, date: date.value, periodId: periodId.value };
  applied.classId = target.classId;
  applied.date = target.date;
  applied.periodId = target.periodId;
  rows.value = [];
  loadError.value = null;
  submit.clearError();
  if (target.classId === null || !target.date) {
    baseline = snapshot();
    return;
  }
  loading.value = true;
  try {
    // another academic year (the class picker changed it): its sessions are different rows
    if (periodsYear.value !== (props.year?.id ?? null)) {
      await loadPeriods();
      target.periodId = periodId.value;
    }
    const sheet = await attendanceApi.sheet(target.classId, target.date, target.periodId);
    if (applied.classId === target.classId && applied.date === target.date) {
      adopt(sheet);
      if (periodId.value === null) {
        periodId.value = sheet.period.id;   // the server picked the year's first session: show it as chosen
        applied.periodId = sheet.period.id;
      }
      choice.remember(props.year?.id, sheet.period.id);
    }
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

watch([classId, date, periodId], () => {
  if (classId.value === applied.classId && date.value === applied.date && periodId.value === applied.periodId) return;
  if (dirty.value) {
    confirmOpen.value = true;
    return;
  }
  void load();
});

// Closing the question any way but "discard" (Cancel, Esc) puts the class, the day and the session back, so the unsaved choices stay on screen.
let discarding = false;

watch(confirmOpen, (open) => {
  if (open) return;
  if (discarding) {
    discarding = false;
    return;
  }
  classId.value = applied.classId;
  date.value = applied.date;
  periodId.value = applied.periodId;
});

function discard(): void {
  discarding = true;
  confirmOpen.value = false;
  void load();
}

function markAllPresent(): void {
  for (const row of rows.value) row.status = 'PRESENT';
}

/** Starts this session from another one the class took today (fills the choices; nothing is saved until "Save"). */
async function copyFromSession(): Promise<void> {
  if (classId.value === null || copyChoice.value === null) return;
  const source = periods.value.find((p) => p.id === copyChoice.value);
  try {
    const other = await attendanceApi.sheet(classId.value, date.value, copyChoice.value);
    const byEnrollment = new Map(other.rows.map((r) => [r.enrollmentId, r]));
    for (const row of rows.value) {
      const from = byEnrollment.get(row.enrollmentId);
      if (from?.status) {
        row.status = from.status;
        row.remark = from.remark ?? '';
      }
    }
    copyChoice.value = null;
    notify.success(t('attendance.copied', { name: source?.nameKm ?? '' }));
  } catch (raised) {
    notify.error(messageFor(raised));
  }
}

async function save(): Promise<void> {
  if (classId.value === null) return;
  const entries: AttendanceEntry[] = rows.value.flatMap((r) => (r.status === '' ? [] : [{ enrollmentId: r.enrollmentId, status: r.status, remark: r.remark.trim() || null }]));
  const saved = await submit.run(() => attendanceApi.save(classId.value as number, date.value, periodId.value, note.value.trim() || null, entries));
  if (!saved) return;
  adopt(saved);
  notify.success(t('attendance.saved'));
}

onMounted(load);
</script>

<template>
  <div>
    <div class="filter-bar">
      <div>
        <label for="attendance-date" class="visually-hidden">{{ t('attendance.date') }}</label>
        <input id="attendance-date" v-model="date" type="date" class="form-control" :max="todayIso()" />
      </div>
      <SessionChoice v-if="choices.length > 1" v-model="periodId" :periods="choices" :recorded="recordedIds" />
      <span v-if="recorded" class="badge text-bg-success" data-testid="attendance-recorded">{{ t('attendance.recorded') }}</span>
      <span v-else-if="rows.length > 0" class="badge text-bg-secondary">{{ t('attendance.notRecorded') }}</span>
    </div>
    <p v-if="sheetPeriod && choices.length > 1" class="small text-muted mb-2" data-testid="attendance-session-label">
      {{ t('attendance.session') }}: {{ periodLabel(sheetPeriod.nameKm, sheetPeriod.startTime, sheetPeriod.endTime) }}
      <span v-if="savedAsOther" data-testid="attendance-saved-as"> · {{ t('attendance.savedAs', { name: livePeriod?.nameKm ?? '' }) }}</span>
    </p>

    <p v-if="props.closed" class="text-muted">{{ t('attendance.yearClosed') }}</p>
    <div v-if="outsideYear && year" class="alert alert-warning" role="status" data-testid="outside-year">
      {{ t('attendance.outsideYear', { from: formatDateKm(year.startDate), to: formatDateKm(year.endDate) }) }}
    </div>
    <div v-if="noSession" class="alert alert-warning" role="status" data-testid="no-session">
      {{ t('attendance.noSession') }} <NuxtLink to="/settings/attendance-sessions">{{ t('attendancePeriods.title') }}</NuxtLink>
    </div>
    <FormAlert :message="submit.formError.value" />

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <p v-if="classId === null" class="text-muted mb-0">{{ t('attendance.chooseClass') }}</p>
      <p v-else-if="rows.length === 0" class="text-muted mb-0">{{ t('attendance.noStudents') }}</p>
      <template v-else>
        <div class="attendance-toolbar">
          <button type="button" class="btn btn-outline-success btn-sm" :disabled="props.closed" @click="markAllPresent">
            <AppIcon name="check-lg" />{{ t('attendance.markAllPresent') }}
          </button>
          <span v-if="!recorded && copySources.length > 0 && !props.closed" class="d-inline-flex gap-1 align-items-center" data-testid="attendance-copy">
            <label for="attendance-copy-from" class="visually-hidden">{{ t('attendance.copyFrom') }}</label>
            <select id="attendance-copy-from" v-model="copyChoice" class="form-select form-select-sm w-auto" data-testid="attendance-copy-from">
              <option :value="null">{{ t('attendance.copyFrom') }}</option>
              <option v-for="p in copySources" :key="p.id" :value="p.id">{{ p.nameKm }}</option>
            </select>
            <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="copyChoice === null" data-testid="attendance-copy-go" @click="copyFromSession">{{ t('attendance.copyAction') }}</button>
          </span>
          <span class="attendance-counts" data-testid="attendance-counts">
            <span v-for="status in ATTENDANCE_STATUSES" :key="status" :class="`badge text-bg-${STATUS_STYLE[status]}`">{{ attendanceStatusLabel(status) }} {{ counts[status] }}</span>
            <span v-if="counts.unmarked > 0" class="badge text-bg-secondary">{{ t('attendance.unmarked', { count: counts.unmarked }) }}</span>
          </span>
        </div>

        <div class="table-responsive scroll-x">
          <table class="table table-hover align-middle mb-3">
            <thead>
              <tr>
                <th>{{ t('students.code') }}</th>
                <th>{{ t('students.nameKm') }}</th>
                <th>{{ t('attendance.statusColumn') }}</th>
                <th>{{ t('attendance.remark') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.enrollmentId" :data-student="row.studentCode">
                <td class="text-nowrap">{{ row.studentCode }}</td>
                <td class="fw-medium">{{ row.nameKm }}</td>
                <td class="text-nowrap">
                  <div class="btn-group btn-group-sm" role="group" :aria-label="row.nameKm">
                    <template v-for="status in ATTENDANCE_STATUSES" :key="status">
                      <input :id="`att-${row.enrollmentId}-${status}`" v-model="row.status" type="radio" class="btn-check" :name="`att-${row.enrollmentId}`" :value="status" :disabled="props.closed" autocomplete="off" />
                      <label class="btn" :class="`btn-outline-${STATUS_STYLE[status]}`" :for="`att-${row.enrollmentId}-${status}`">{{ attendanceStatusLabel(status) }}</label>
                    </template>
                  </div>
                </td>
                <td>
                  <input v-model="row.remark" class="form-control form-control-sm" maxlength="200" autocomplete="off" :disabled="props.closed" :aria-label="t('attendance.remark')" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="mb-3">
          <label for="attendance-note" class="form-label">{{ t('attendance.note') }}</label>
          <input id="attendance-note" v-model="note" class="form-control" maxlength="500" autocomplete="off" :disabled="props.closed" />
        </div>

        <LoadingButton icon="check-lg" :loading="submit.submitting.value" :disabled="props.closed || counts.unmarked === rows.length" @click="save">{{ t('common.save') }}</LoadingButton>
        <span v-if="dirty" class="text-muted ms-3">{{ t('attendance.unsaved') }}</span>
      </template>
    </StateBlock>

    <ConfirmModal v-model="confirmOpen" :title="t('attendance.discardTitle')" :message="t('attendance.discardMessage')" :confirm-label="t('attendance.discard')" @confirm="discard" />
  </div>
</template>
