<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useField, useForm } from 'vee-validate';
import { normalizeClock } from '~/schemas/attendance';
import { timetableSlotSchema } from '~/schemas/timetable';
import { academicApi } from '~/services/academicApi';
import { timetableApi } from '~/services/timetableApi';
import type { AcademicYear, TimetableCopyResult, TimetableSettings, TimetableSlot } from '~/types/api';
import { WEEK_DAYS, slotTimes } from '~/utils/timetable';

// Settings > Timetable: the school days and the time slots of each academic year, typed by the school. Nothing is filled in by the program: a year starts with no slot and
// Monday to Friday as the starting choice for the days (nothing is written until someone saves). Slots of a year are listed by time and never overlap; a break is a shaded
// row that holds no lesson; a slot that holds lessons can be renamed or moved but not deleted. A closed year is read-only. A new year can take over the other year's days,
// slots and lessons after a preview.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const years = ref<AcademicYear[]>([]);
const yearId = ref<number | null>(null);
const settings = ref<TimetableSettings | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busy = ref<string | null>(null);
const showForm = ref(false);
const editing = ref<TimetableSlot | null>(null);
const deleting = ref<TimetableSlot | null>(null);
const deleteOpen = computed({
  get: () => deleting.value !== null,
  set: (open: boolean) => {
    if (!open) deleting.value = null;
  },
});

const dayChoice = ref<number[]>([]);
const copyFrom = ref<number | null>(null);
const preview = ref<TimetableCopyResult | null>(null);

const closed = computed(() => settings.value?.yearClosed ?? false);
const otherYears = computed(() => years.value.filter((y) => y.id !== yearId.value));
const daysChanged = computed(() => {
  const saved = settings.value?.days ?? [];
  return saved.length !== dayChoice.value.length || saved.some((d) => !dayChoice.value.includes(d));
});

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(timetableSlotSchema),
  initialValues: { nameKm: '', startTime: '', endTime: '', breakSlot: false },
});
const { value: breakSlot } = useField<boolean>('breakSlot');
const submit = useSubmit({ fields: ['nameKm', 'startTime', 'endTime'], setErrors });

async function loadSettings(): Promise<void> {
  if (yearId.value === null) {
    settings.value = null;
    return;
  }
  settings.value = await timetableApi.settings(yearId.value);
  dayChoice.value = [...settings.value.days];
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    years.value = await academicApi.years();
    if (yearId.value === null) yearId.value = (years.value.find((y) => y.current) ?? years.value[0])?.id ?? null;
    await loadSettings();
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
  preview.value = null;
  loadSettings().catch((raised) => {
    loadError.value = messageFor(raised);
  });
});
watch(copyFrom, () => {
  preview.value = null;
});

function toggleDay(day: number): void {
  dayChoice.value = dayChoice.value.includes(day) ? dayChoice.value.filter((d) => d !== day) : [...dayChoice.value, day].sort((a, b) => a - b);
}

async function saveDays(): Promise<void> {
  if (yearId.value === null) return;
  busy.value = 'days';
  try {
    settings.value = await timetableApi.setDays(yearId.value, dayChoice.value);
    dayChoice.value = [...settings.value.days];
    notify.success(t('timetable.settings.daysSaved'));
  } catch (raised) {
    notify.error(messageFor(raised));
    await loadSettings().catch(() => undefined);
  } finally {
    busy.value = null;
  }
}

function openCreate(): void {
  editing.value = null;
  resetForm({ values: { nameKm: '', startTime: '', endTime: '', breakSlot: false } });
  submit.clearError();
  showForm.value = true;
}

function openEdit(slot: TimetableSlot): void {
  editing.value = slot;
  resetForm({ values: { nameKm: slot.nameKm, startTime: slot.startTime, endTime: slot.endTime, breakSlot: slot.breakSlot } });
  submit.clearError();
  showForm.value = true;
}

const onSubmit = handleSubmit(async (form) => {
  const target = editing.value;
  const start = normalizeClock(form.startTime);
  const end = normalizeClock(form.endTime);
  const saved = await submit.run(() =>
    target
      ? timetableApi.updateSlot(target.id, form.nameKm, start, end, form.breakSlot, target.version)
      : timetableApi.createSlot(yearId.value as number, form.nameKm, start, end, form.breakSlot),
  );
  if (!saved) {
    const code = submit.lastError.value?.code;
    if (code === 'OPTIMISTIC_LOCK' || code === 'ACADEMIC_YEAR_CLOSED') {
      notify.warning(t('timetable.settings.reloaded'));
      await loadSettings();
    }
    return;
  }
  notify.success(t(target ? 'timetable.settings.slotUpdated' : 'timetable.settings.slotCreated'));
  showForm.value = false;
  editing.value = null;
  resetForm();
  await loadSettings();
});

async function confirmDelete(): Promise<void> {
  const slot = deleting.value;
  deleting.value = null;
  if (!slot) return;
  busy.value = `slot-${slot.id}`;
  try {
    await timetableApi.removeSlot(slot.id);
    notify.success(t('timetable.settings.slotDeleted'));
  } catch (raised) {
    notify.error(messageFor(raised));
  } finally {
    busy.value = null;
  }
  await loadSettings();
}

async function runCopy(previewOnly: boolean): Promise<void> {
  if (copyFrom.value === null || yearId.value === null) return;
  busy.value = previewOnly ? 'copy-preview' : 'copy';
  try {
    const answer = await timetableApi.copyYear(yearId.value, copyFrom.value, previewOnly);
    if (previewOnly) {
      preview.value = answer;
    } else {
      notify.success(t('timetable.copy.done'));
      preview.value = null;
      copyFrom.value = null;
      await loadSettings();
    }
  } catch (raised) {
    notify.error(messageFor(raised));
  } finally {
    busy.value = null;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <StateBlock :loading="loading" :error="loadError" @retry="load">
    <p v-if="years.length === 0" class="mb-0">
      {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
    </p>
    <template v-else-if="settings">
      <p class="text-muted">{{ t('timetable.settings.intro') }}</p>

      <div class="filter-bar">
        <div>
          <label for="tt-year" class="form-label mb-1">{{ t('attendancePeriods.year') }}</label>
          <select id="tt-year" v-model="yearId" class="form-select" data-testid="tt-year">
            <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}</option>
          </select>
        </div>
      </div>
      <p v-if="closed" class="text-muted" data-testid="tt-year-closed">{{ t('timetable.settings.yearClosed') }}</p>

      <!-- the school days -->
      <section class="mb-4" data-testid="tt-days">
        <h3 class="h6">{{ t('timetable.settings.daysTitle') }}</h3>
        <p class="small text-muted mb-2">{{ settings.daysAreDefault ? t('timetable.settings.daysDefault') : t('timetable.settings.daysChosen') }}</p>
        <div class="d-flex flex-wrap gap-3 mb-2">
          <div v-for="d in WEEK_DAYS" :key="d" class="form-check">
            <input :id="`tt-day-${d}`" type="checkbox" class="form-check-input" :data-testid="`tt-day-${d}`" :checked="dayChoice.includes(d)" :disabled="closed || busy !== null" @change="toggleDay(d)" />
            <label :for="`tt-day-${d}`" class="form-check-label">{{ t(`timetable.day.${d}`) }}</label>
          </div>
        </div>
        <LoadingButton variant="outline-primary" size="sm" icon="check-lg" :loading="busy === 'days'" :disabled="closed || busy !== null || !daysChanged || dayChoice.length === 0" data-testid="tt-days-save" @click="saveDays">
          {{ t('timetable.settings.saveDays') }}
        </LoadingButton>
      </section>

      <!-- the slots -->
      <section data-testid="tt-slots">
        <h3 class="h6">{{ t('timetable.settings.slotsTitle') }}</h3>
        <div v-if="settings.slots.length === 0" class="alert alert-info" role="status" data-testid="tt-slots-empty">
          <div class="fw-semibold">{{ t('timetable.settings.emptyTitle') }}</div>
          <div>{{ t('timetable.settings.emptyText') }}</div>
        </div>
        <div v-else class="table-responsive scroll-x mb-3">
          <table class="table table-sm align-middle mb-0" data-testid="tt-slot-table">
            <thead>
              <tr>
                <th>{{ t('timetable.settings.slotName') }}</th>
                <th>{{ t('timetable.settings.times') }}</th>
                <th>{{ t('timetable.settings.kind') }}</th>
                <th class="text-end">{{ t('timetable.settings.lessons') }}</th>
                <th><span class="visually-hidden">{{ t('academic.year.actions') }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in settings.slots" :key="s.id" data-testid="tt-slot-row" :data-slot="s.nameKm" :class="{ 'table-secondary': s.breakSlot }">
                <td class="fw-medium">{{ s.nameKm }}</td>
                <td class="text-nowrap">{{ slotTimes(s) }}</td>
                <td>{{ s.breakSlot ? t('timetable.settings.break') : t('timetable.settings.lesson') }}</td>
                <td class="text-end">{{ s.lessons }}</td>
                <td>
                  <div class="d-flex gap-1 justify-content-end flex-wrap">
                    <LoadingButton variant="outline-secondary" size="sm" icon="pencil" :disabled="closed || busy !== null" data-testid="tt-slot-edit" @click="openEdit(s)">{{ t('academic.year.edit') }}</LoadingButton>
                    <LoadingButton v-if="s.lessons === 0" variant="outline-secondary" size="sm" icon="trash" :loading="busy === `slot-${s.id}`" :disabled="closed || busy !== null" data-testid="tt-slot-delete" @click="deleting = s">
                      {{ t('timetable.settings.delete') }}
                    </LoadingButton>
                    <span v-else class="small text-muted align-self-center" :title="t('timetable.settings.inUse')">{{ t('timetable.settings.inUseShort') }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="settings.slots.length > 0" class="small text-muted">{{ t('timetable.settings.keepsLessons') }}</p>

        <button v-if="!showForm" type="button" class="btn btn-outline-primary btn-sm" data-testid="tt-slot-add" :disabled="closed" @click="openCreate">
          <AppIcon name="plus-lg" />{{ t('timetable.settings.add') }}
        </button>
        <form v-else novalidate class="year-form" data-testid="tt-slot-form" @submit.prevent="onSubmit">
          <h3 class="h6">{{ t(editing ? 'timetable.settings.editTitle' : 'timetable.settings.addTitle') }}</h3>
          <FormAlert :message="submit.formError.value" />
          <div class="row">
            <div class="col-md-5"><FormInput name="nameKm" :label="t('timetable.settings.slotName')" required :maxlength="50" :hint="t('timetable.settings.nameHint')" /></div>
            <div class="col-md-3"><FormInput name="startTime" :label="t('attendancePeriods.start')" required placeholder="07:00" inputmode="numeric" :maxlength="5" /></div>
            <div class="col-md-3"><FormInput name="endTime" :label="t('attendancePeriods.end')" required placeholder="07:45" inputmode="numeric" :maxlength="5" /></div>
          </div>
          <div class="form-check mb-1">
            <input id="tt-slot-break" v-model="breakSlot" type="checkbox" class="form-check-input" data-testid="tt-slot-break" />
            <label for="tt-slot-break" class="form-check-label">{{ t('timetable.settings.isBreak') }}</label>
          </div>
          <p class="form-text mt-0">{{ t('timetable.settings.timesHint') }}</p>
          <div class="d-flex gap-2">
            <LoadingButton type="submit" :icon="editing ? 'check-lg' : 'plus-lg'" :loading="submit.submitting.value" data-testid="tt-slot-save">{{ t('common.save') }}</LoadingButton>
            <button type="button" class="btn btn-outline-secondary" @click="showForm = false">{{ t('common.cancel') }}</button>
          </div>
        </form>
      </section>

      <!-- take over another year: only into an empty, open year -->
      <section v-if="settings.slots.length === 0 && !closed && otherYears.length > 0" class="mt-4" data-testid="tt-year-copy">
        <h3 class="h6">{{ t('timetable.copy.yearTitle') }}</h3>
        <p class="small text-muted mb-2">{{ t('timetable.copy.yearHint') }}</p>
        <div class="filter-bar">
          <div>
            <label for="tt-copy-year" class="visually-hidden">{{ t('timetable.copy.fromYear') }}</label>
            <select id="tt-copy-year" v-model="copyFrom" class="form-select" data-testid="tt-copy-year">
              <option :value="null">{{ t('timetable.copy.fromYear') }}</option>
              <option v-for="y in otherYears" :key="y.id" :value="y.id">{{ y.nameKm }}</option>
            </select>
          </div>
          <LoadingButton variant="outline-primary" icon="eye" :loading="busy === 'copy-preview'" :disabled="copyFrom === null || busy !== null" data-testid="tt-year-preview" @click="runCopy(true)">{{ t('timetable.copy.preview') }}</LoadingButton>
          <LoadingButton icon="files" :loading="busy === 'copy'" :disabled="!preview || preview.slots === 0 || busy !== null" data-testid="tt-year-copy-go" @click="runCopy(false)">{{ t('timetable.copy.go') }}</LoadingButton>
        </div>
        <TimetableCopyList v-if="preview" :result="preview" show-class />
        <p v-if="preview && preview.slots === 0" class="small text-muted mt-2" data-testid="tt-year-nothing">{{ t('timetable.copy.nothingToCopy') }}</p>
      </section>
    </template>
    <ConfirmModal
      v-model="deleteOpen"
      :title="t('timetable.settings.deleteTitle')"
      :message="t('timetable.settings.deleteMessage', { name: deleting?.nameKm ?? '' })"
      :confirm-label="t('timetable.settings.delete')"
      @confirm="confirmDelete"
    />
  </StateBlock>
</template>
