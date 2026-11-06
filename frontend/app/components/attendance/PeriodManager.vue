<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { attendancePeriodSchema, normalizeClock } from '~/schemas/attendance';
import { academicApi } from '~/services/academicApi';
import { attendancePeriodsApi } from '~/services/attendancePeriodsApi';
import type { AcademicYear, AttendancePeriod } from '~/types/api';
import { timeRange } from '~/utils/attendance';
import { formatDateTimeKm } from '~/utils/date';

// The sessions of the school day, per academic year: a name and optional times (information only), an order, on/off, and "confirmed by the school".
// The school's timetable changes, so nothing here is fixed: sessions can be added, renamed, re-timed, switched off and re-ordered at any time,
// and a sheet already taken keeps the name and times it was saved with. A session that has sheets is switched off, not deleted.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const years = ref<AcademicYear[]>([]);
const yearId = ref<number | null>(null);
const periods = ref<AttendancePeriod[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const editing = ref<AttendancePeriod | null>(null);
const busyId = ref<number | null>(null);
const deleting = ref<AttendancePeriod | null>(null);
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null;
  },
});
const copyFrom = ref<number | null>(null);

const year = computed(() => years.value.find((y) => y.id === yearId.value) ?? null);
const closed = computed(() => year.value?.status === 'CLOSED');
const otherYears = computed(() => years.value.filter((y) => y.id !== yearId.value));

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(attendancePeriodSchema),
  initialValues: { nameKm: '', startTime: '', endTime: '' },
});
const submit = useSubmit({ fields: ['nameKm', 'startTime', 'endTime'], setErrors });

async function loadPeriods(): Promise<void> {
  if (yearId.value === null) {
    periods.value = [];
    return;
  }
  periods.value = await attendancePeriodsApi.list(yearId.value);
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    years.value = await academicApi.years();
    if (yearId.value === null) yearId.value = (years.value.find((y) => y.current) ?? years.value[0])?.id ?? null;
    await loadPeriods();
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

watch(yearId, () => {
  showForm.value = false;
  editing.value = null;
  copyFrom.value = null;
  loadPeriods().catch((raised) => {
    loadError.value = messageFor(raised);
  });
});

function openCreate(): void {
  editing.value = null;
  resetForm({ values: { nameKm: '', startTime: '', endTime: '' } });
  submit.clearError();
  showForm.value = true;
}

function openEdit(period: AttendancePeriod): void {
  editing.value = period;
  resetForm({ values: { nameKm: period.nameKm, startTime: period.startTime ?? '', endTime: period.endTime ?? '' } });
  submit.clearError();
  showForm.value = true;
}

const onSubmit = handleSubmit(async (form) => {
  const target = editing.value;
  const start = normalizeClock(form.startTime) || null;
  const end = normalizeClock(form.endTime) || null;
  const saved = await submit.run(() =>
    target ? attendancePeriodsApi.update(target.id, form.nameKm, start, end, target.version) : attendancePeriodsApi.create(yearId.value as number, form.nameKm, start, end),
  );
  if (!saved) {
    const code = submit.lastError.value?.code;
    if (code === 'OPTIMISTIC_LOCK' || code === 'ACADEMIC_YEAR_CLOSED') {
      notify.warning(t('attendancePeriods.reloaded'));
      await loadPeriods();
    }
    return;
  }
  notify.success(t(target ? 'attendancePeriods.updated' : 'attendancePeriods.created'));
  showForm.value = false;
  editing.value = null;
  resetForm();
  await loadPeriods();
});

/** One row action: run it, say what happened, and reload (the state may have changed even when it failed). */
async function act(period: AttendancePeriod, action: () => Promise<unknown>, doneKey: string): Promise<void> {
  busyId.value = period.id;
  try {
    await action();
    notify.success(t(doneKey));
  } catch (raised) {
    notify.error(messageFor(raised));
  } finally {
    busyId.value = null;
  }
  await loadPeriods();
}

function toggle(period: AttendancePeriod): Promise<void> {
  return act(period, () => attendancePeriodsApi.setEnabled(period.id, !period.enabled, period.version), period.enabled ? 'attendancePeriods.switchedOff' : 'attendancePeriods.switchedOn');
}

function move(period: AttendancePeriod, delta: -1 | 1): Promise<void> {
  const ids = periods.value.map((p) => p.id);
  const from = ids.indexOf(period.id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return Promise.resolve();
  [ids[from], ids[to]] = [ids[to] as number, ids[from] as number];
  return act(period, () => attendancePeriodsApi.reorder(yearId.value as number, ids), 'attendancePeriods.moved');
}

async function confirmDelete(): Promise<void> {
  const period = deleting.value;
  deleting.value = null;
  if (period) await act(period, () => attendancePeriodsApi.remove(period.id), 'attendancePeriods.deleted');
}

async function copy(): Promise<void> {
  if (copyFrom.value === null || yearId.value === null) return;
  const from = copyFrom.value;
  const to = yearId.value;
  busyId.value = -1;
  try {
    periods.value = await attendancePeriodsApi.copy(from, to);
    notify.success(t('attendancePeriods.copied'));
    copyFrom.value = null;
  } catch (raised) {
    notify.error(messageFor(raised));
  } finally {
    busyId.value = null;
  }
}

/** A session with times that nobody has confirmed may be an example, not the school's real timetable. */
const unconfirmed = (p: AttendancePeriod): boolean => p.startTime !== null && p.confirmedAt === null;

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <StateBlock :loading="loading" :error="loadError" @retry="load">
    <p v-if="years.length === 0" class="mb-0">
      {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
    </p>
    <template v-else>
      <p class="text-muted">{{ t('attendancePeriods.intro') }}</p>

      <div class="filter-bar">
        <div>
          <label for="period-year" class="form-label mb-1">{{ t('attendancePeriods.year') }}</label>
          <select id="period-year" v-model="yearId" class="form-select" data-testid="period-year">
            <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}</option>
          </select>
        </div>
      </div>
      <p v-if="closed" class="text-muted">{{ t('attendancePeriods.yearClosed') }}</p>

      <div class="table-responsive scroll-x mb-3">
        <table class="table table-sm align-middle mb-0" data-testid="period-table">
          <thead>
            <tr>
              <th>{{ t('attendancePeriods.order') }}</th>
              <th>{{ t('attendancePeriods.name') }}</th>
              <th>{{ t('attendancePeriods.times') }}</th>
              <th>{{ t('attendancePeriods.state') }}</th>
              <th class="text-end">{{ t('attendancePeriods.sheets') }}</th>
              <th><span class="visually-hidden">{{ t('academic.year.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, index) in periods" :key="p.id" data-testid="period-row" :data-period="p.nameKm" :class="{ 'text-muted': !p.enabled }">
              <td class="text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-secondary me-1" data-testid="period-up" :disabled="closed || index === 0 || busyId !== null" :aria-label="t('attendancePeriods.moveUp')" @click="move(p, -1)">
                  <AppIcon name="arrow-up" />
                </button>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-testid="period-down" :disabled="closed || index === periods.length - 1 || busyId !== null" :aria-label="t('attendancePeriods.moveDown')" @click="move(p, 1)">
                  <AppIcon name="arrow-down" />
                </button>
              </td>
              <td class="fw-medium">{{ p.nameKm }}</td>
              <td class="text-nowrap">{{ timeRange(p.startTime, p.endTime) || t('attendancePeriods.noTimes') }}</td>
              <td>
                <span v-if="!p.enabled" class="badge text-bg-secondary me-1" data-testid="period-off">{{ t('attendancePeriods.offBadge') }}</span>
                <span v-if="unconfirmed(p)" class="badge text-bg-warning" data-testid="period-unconfirmed" :title="t('attendancePeriods.unconfirmedHint')">{{ t('attendancePeriods.unconfirmed') }}</span>
                <span v-else-if="p.confirmedAt" class="small text-success-emphasis" data-testid="period-confirmed">
                  {{ t('attendancePeriods.confirmed', { name: p.confirmedBy ?? '', date: formatDateTimeKm(p.confirmedAt) }) }}
                </span>
              </td>
              <td class="text-end">{{ p.sheets }}</td>
              <td>
                <div class="d-flex gap-1 justify-content-end flex-wrap align-items-center">
                  <div class="form-check form-switch mb-0 me-2">
                    <input :id="`period-on-${p.id}`" type="checkbox" role="switch" class="form-check-input" data-testid="period-switch" :checked="p.enabled" :disabled="closed || busyId !== null" @click.prevent="toggle(p)" />
                    <label :for="`period-on-${p.id}`" class="form-check-label">{{ t(p.enabled ? 'attendancePeriods.on' : 'attendancePeriods.off') }}</label>
                  </div>
                  <LoadingButton v-if="unconfirmed(p)" variant="outline-primary" size="sm" icon="check-lg" :disabled="closed" :loading="busyId === p.id" data-testid="period-confirm" @click="act(p, () => attendancePeriodsApi.confirm(p.id), 'attendancePeriods.confirmedDone')">
                    {{ t('attendancePeriods.confirm') }}
                  </LoadingButton>
                  <LoadingButton variant="outline-secondary" size="sm" icon="pencil" :disabled="closed || busyId !== null" data-testid="period-edit" @click="openEdit(p)">{{ t('academic.year.edit') }}</LoadingButton>
                  <LoadingButton v-if="p.sheets === 0" variant="outline-secondary" size="sm" icon="trash" :disabled="closed || busyId !== null" data-testid="period-delete" @click="deleting = p">{{ t('attendancePeriods.delete') }}</LoadingButton>
                  <span v-else class="small text-muted" :title="t('attendancePeriods.inUse')">{{ t('attendancePeriods.inUseShort') }}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="small text-muted">{{ t('attendancePeriods.keepsHistory') }}</p>

      <button v-if="!showForm" type="button" class="btn btn-outline-primary btn-sm" data-testid="period-add" :disabled="closed" @click="openCreate">
        <AppIcon name="plus-lg" />{{ t('attendancePeriods.add') }}
      </button>
      <form v-else novalidate class="year-form" data-testid="period-form" @submit.prevent="onSubmit">
        <h3 class="h6">{{ t(editing ? 'attendancePeriods.editTitle' : 'attendancePeriods.addTitle') }}</h3>
        <FormAlert :message="submit.formError.value" />
        <div class="row">
          <div class="col-md-5"><FormInput name="nameKm" :label="t('attendancePeriods.name')" required :maxlength="50" :hint="t('attendancePeriods.nameHint')" /></div>
          <div class="col-md-3"><FormInput name="startTime" :label="t('attendancePeriods.start')" placeholder="07:00" inputmode="numeric" :maxlength="5" /></div>
          <div class="col-md-3"><FormInput name="endTime" :label="t('attendancePeriods.end')" placeholder="11:00" inputmode="numeric" :maxlength="5" /></div>
        </div>
        <p class="form-text mt-0">{{ t('attendancePeriods.timesHint') }}</p>
        <div class="d-flex gap-2">
          <LoadingButton type="submit" :icon="editing ? 'check-lg' : 'plus-lg'" :loading="submit.submitting.value" data-testid="period-save">{{ t('common.save') }}</LoadingButton>
          <button type="button" class="btn btn-outline-secondary" @click="showForm = false">{{ t('common.cancel') }}</button>
        </div>
      </form>

      <section v-if="otherYears.length > 0 && !closed" class="mt-4" data-testid="period-copy">
        <h3 class="h6">{{ t('attendancePeriods.copyTitle') }}</h3>
        <p class="small text-muted mb-2">{{ t('attendancePeriods.copyHint') }}</p>
        <div class="filter-bar mb-0">
          <div>
            <label for="period-copy-from" class="visually-hidden">{{ t('attendancePeriods.copyFrom') }}</label>
            <select id="period-copy-from" v-model="copyFrom" class="form-select" data-testid="period-copy-from">
              <option :value="null">{{ t('attendancePeriods.copyFrom') }}</option>
              <option v-for="y in otherYears" :key="y.id" :value="y.id">{{ y.nameKm }}</option>
            </select>
          </div>
          <LoadingButton variant="outline-secondary" icon="files" :disabled="copyFrom === null" :loading="busyId === -1" data-testid="period-copy-go" @click="copy">{{ t('attendancePeriods.copyAction') }}</LoadingButton>
        </div>
      </section>
    </template>
    <ConfirmModal
      v-model="deleteOpen"
      :title="t('attendancePeriods.deleteTitle')"
      :message="t('attendancePeriods.deleteMessage', { name: deleting?.nameKm ?? '' })"
      :confirm-label="t('attendancePeriods.delete')"
      @confirm="confirmDelete"
    />
  </StateBlock>
</template>
