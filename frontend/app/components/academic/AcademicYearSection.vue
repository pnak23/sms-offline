<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { academicYearSchema } from '~/schemas/academic';
import { academicApi } from '~/services/academicApi';
import type { AcademicYear } from '~/types/api';
import { formatDateKm, suggestYearName } from '~/utils/date';
import { asciiDigitsToKhmer } from '~/utils/khmer';

// Academic years: the list, and a form to add one. Dates start EMPTY: no school calendar is assumed.
const emit = defineEmits<{ changed: [years: AcademicYear[]] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const years = ref<AcademicYear[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);

const { handleSubmit, setErrors, resetForm, setFieldValue } = useForm({
  validationSchema: toTypedSchema(academicYearSchema),
  initialValues: { nameKm: '', startDate: '', endDate: '' },
});
const submit = useSubmit({ fields: ['nameKm', 'startDate', 'endDate'], setErrors });

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    years.value = await academicApi.years();
    showForm.value = years.value.length === 0;
    emit('changed', years.value);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

const onSubmit = handleSubmit(async (form) => {
  const created = await submit.run(() => academicApi.createYear({ ...form, makeCurrent: true }));
  if (!created) return;
  notify.success(t('academic.year.created'));
  resetForm();
  await load();
});

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
        <table class="table table-sm mb-0">
          <thead>
            <tr>
              <th>{{ t('academic.year.name') }}</th>
              <th>{{ t('academic.year.start') }}</th>
              <th>{{ t('academic.year.end') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="year in years" :key="year.id">
              <td class="fw-medium">{{ year.nameKm }}</td>
              <td>{{ formatDateKm(year.startDate) }}</td>
              <td>{{ formatDateKm(year.endDate) }}</td>
              <td><span v-if="year.current" class="badge text-bg-success">{{ t('academic.year.current') }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <button v-if="!showForm" type="button" class="btn btn-outline-primary btn-sm" @click="showForm = true">
        <AppIcon name="plus-lg" />{{ t('academic.year.add') }}
      </button>

      <form v-else novalidate class="year-form" @submit.prevent="onSubmit">
        <p class="text-muted mb-2">{{ t('academic.year.intro') }}</p>
        <FormAlert :message="submit.formError.value" />
        <div class="row">
          <div class="col-md-4">
            <FormInput name="nameKm" :label="t('academic.year.name')" required :maxlength="50">
              <button type="button" class="btn btn-link btn-sm px-0" @click="applySuggestion">{{ t('academic.year.suggest', { name: asciiDigitsToKhmer(suggestYearName()) }) }}</button>
            </FormInput>
          </div>
          <div class="col-md-4"><FormInput name="startDate" type="date" :label="t('academic.year.start')" required /></div>
          <div class="col-md-4"><FormInput name="endDate" type="date" :label="t('academic.year.end')" required /></div>
        </div>
        <div class="d-flex gap-2">
          <LoadingButton type="submit" icon="plus-lg" :loading="submit.submitting.value">{{ t('academic.year.create') }}</LoadingButton>
          <button v-if="years.length" type="button" class="btn btn-outline-secondary" @click="showForm = false">{{ t('common.cancel') }}</button>
        </div>
      </form>
    </StateBlock>
  </section>
</template>
