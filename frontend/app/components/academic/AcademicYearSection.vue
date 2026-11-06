<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { academicYearSchema } from '~/schemas/academic';
import { academicApi } from '~/services/academicApi';
import type { AcademicYear } from '~/types/api';
import { formatDateKm, suggestYearName } from '~/utils/date';
import { asciiDigitsToKhmer } from '~/utils/khmer';

// Academic years: the list, and a form to add one. Dates start EMPTY: no school calendar is assumed.
// The wizard only adds the first year. With `manage` (Settings -> Academic) a row can also be edited, made current,
// closed (read-only) and reopened.
const props = defineProps<{ manage?: boolean }>();
const emit = defineEmits<{ changed: [years: AcademicYear[]] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const years = ref<AcademicYear[]>([]);
const loaded = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const editing = ref<AcademicYear | null>(null);
const makeCurrent = ref(true);
const busyId = ref<number | null>(null);
const closing = ref<AcademicYear | null>(null);
const closeOpen = computed({
  get: () => closing.value !== null,
  set: (open: boolean) => {
    if (!open) closing.value = null;
  },
});

const { handleSubmit, setErrors, resetForm, setFieldValue } = useForm({
  validationSchema: toTypedSchema(academicYearSchema),
  initialValues: { nameKm: '', startDate: '', endDate: '' },
});
const submit = useSubmit({ fields: ['nameKm', 'startDate', 'endDate'], setErrors });

async function load(): Promise<void> {
  if (!loaded.value) loading.value = true; // later reloads keep the table on screen instead of flashing a spinner
  loadError.value = null;
  try {
    years.value = await academicApi.years();
    loaded.value = true;
    showForm.value = years.value.length === 0;
    editing.value = null;
    emit('changed', years.value);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editing.value = null;
  makeCurrent.value = !years.value.some((year) => year.current); // next year's calendar must not silently replace the running year
  resetForm({ values: { nameKm: '', startDate: '', endDate: '' } });
  submit.clearError();
  showForm.value = true;
}

function openEdit(year: AcademicYear): void {
  editing.value = year;
  resetForm({ values: { nameKm: year.nameKm, startDate: year.startDate, endDate: year.endDate } });
  submit.clearError();
  showForm.value = true;
}

const onSubmit = handleSubmit(async (form) => {
  const target = editing.value;
  const saved = await submit.run(() =>
    target
      ? academicApi.updateYear(target.id, { ...form, version: target.version })
      : academicApi.createYear({ ...form, makeCurrent: props.manage ? makeCurrent.value : true }),
  );
  if (!saved) {
    const code = submit.lastError.value?.code;
    if (code === 'OPTIMISTIC_LOCK' || code === 'ACADEMIC_YEAR_CLOSED') {
      notify.warning(t('academic.year.reloaded'));
      await load();
    }
    return;
  }
  notify.success(t(target ? 'academic.year.updated' : 'academic.year.created'));
  resetForm();
  await load();
});

/** One row action: run it, say what happened, and reload (the state may have changed even when it failed). */
async function act(year: AcademicYear, action: () => Promise<AcademicYear>, doneKey: string): Promise<void> {
  busyId.value = year.id;
  try {
    await action();
    notify.success(t(doneKey));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busyId.value = null;
  }
  await load();
}

async function confirmClose(): Promise<void> {
  const year = closing.value;
  closing.value = null;
  if (year) await act(year, () => academicApi.closeYear(year.id), 'academic.year.closedDone');
}

function applySuggestion(): void {
  setFieldValue('nameKm', asciiDigitsToKhmer(suggestYearName()));
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <section class="mb-4">
    <h3 class="h5">{{ t('academic.year.title') }}</h3>
    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <div v-if="years.length" class="table-responsive scroll-x mb-3">
        <table class="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th>{{ t('academic.year.name') }}</th>
              <th>{{ t('academic.year.start') }}</th>
              <th>{{ t('academic.year.end') }}</th>
              <th />
              <th v-if="manage"><span class="visually-hidden">{{ t('academic.year.actions') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="year in years" :key="year.id">
              <td class="fw-medium">{{ year.nameKm }}</td>
              <td>{{ formatDateKm(year.startDate) }}</td>
              <td>{{ formatDateKm(year.endDate) }}</td>
              <td>
                <span v-if="year.current" class="badge text-bg-success">{{ t('academic.year.current') }}</span>
                <span v-if="year.status === 'CLOSED'" class="badge text-bg-secondary">{{ t('academic.year.closed') }}</span>
              </td>
              <td v-if="manage">
                <div class="d-flex gap-1 justify-content-end flex-wrap">
                  <template v-if="year.status === 'CLOSED'">
                    <LoadingButton
                      variant="outline-secondary"
                      size="sm"
                      icon="unlock"
                      :loading="busyId === year.id"
                      @click="act(year, () => academicApi.reopenYear(year.id), 'academic.year.reopened')"
                    >
                      {{ t('academic.year.reopen') }}
                    </LoadingButton>
                  </template>
                  <template v-else>
                    <LoadingButton variant="outline-secondary" size="sm" icon="pencil" :disabled="busyId === year.id" @click="openEdit(year)">
                      {{ t('academic.year.edit') }}
                    </LoadingButton>
                    <LoadingButton
                      v-if="!year.current"
                      variant="outline-primary"
                      size="sm"
                      icon="check-circle-fill"
                      :loading="busyId === year.id"
                      @click="act(year, () => academicApi.setCurrentYear(year.id), 'academic.year.madeCurrent')"
                    >
                      {{ t('academic.year.makeCurrent') }}
                    </LoadingButton>
                    <LoadingButton variant="outline-secondary" size="sm" icon="lock" :disabled="busyId === year.id" @click="closing = year">
                      {{ t('academic.year.close') }}
                    </LoadingButton>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="!showForm" type="button" class="btn btn-outline-primary btn-sm" @click="openCreate">
        <AppIcon name="plus-lg" />{{ t('academic.year.add') }}
      </button>
      <form v-else novalidate class="year-form" @submit.prevent="onSubmit">
        <h4 v-if="editing" class="h6">{{ t('academic.year.editTitle') }}</h4>
        <p v-else class="text-muted mb-2">{{ t(manage ? 'academic.year.introManage' : 'academic.year.intro') }}</p>
        <FormAlert :message="submit.formError.value" />
        <div class="row">
          <div class="col-md-4">
            <FormInput name="nameKm" :label="t('academic.year.name')" required :maxlength="50">
              <button v-if="!editing" type="button" class="btn btn-link btn-sm px-0" @click="applySuggestion">{{ t('academic.year.suggest', { name: asciiDigitsToKhmer(suggestYearName()) }) }}</button>
            </FormInput>
          </div>
          <div class="col-md-4"><FormInput name="startDate" type="date" :label="t('academic.year.start')" required /></div>
          <div class="col-md-4"><FormInput name="endDate" type="date" :label="t('academic.year.end')" required /></div>
        </div>
        <div v-if="manage && !editing" class="form-check mb-3">
          <input id="year-make-current" v-model="makeCurrent" type="checkbox" class="form-check-input" />
          <label for="year-make-current" class="form-check-label">{{ t('academic.year.makeCurrentOnCreate') }}</label>
        </div>
        <div class="d-flex gap-2">
          <LoadingButton type="submit" :icon="editing ? 'check-lg' : 'plus-lg'" :loading="submit.submitting.value">
            {{ t(editing ? 'common.save' : 'academic.year.create') }}
          </LoadingButton>
          <button v-if="years.length" type="button" class="btn btn-outline-secondary" @click="showForm = false">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </StateBlock>
    <ConfirmModal
      v-if="manage"
      v-model="closeOpen"
      :title="t('academic.year.closeTitle')"
      :message="t('academic.year.closeMessage', { name: closing?.nameKm ?? '' })"
      :confirm-label="t('academic.year.close')"
      @confirm="confirmClose"
    />
  </section>
</template>
