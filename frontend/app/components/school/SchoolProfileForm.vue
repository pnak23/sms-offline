<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { schoolSchema } from '~/schemas/school';
import { settingsApi } from '~/services/settingsApi';
import { useSchoolStore } from '~/stores/school';
import type { SchoolProfile } from '~/types/api';
import { isApiError } from '~/utils/apiError';
import { khmerDigitsToAscii } from '~/utils/khmer';

/**
 * The school profile form, shared by wizard step 4 and Settings -> School. `wizard` mode adds Skip (step 4 is the first step that can be resumed, so there is no Back).
 * Saving sends the `version` of the last profile read; a stale version (OPTIMISTIC_LOCK) reloads the form.
 */
const props = defineProps<{ wizard?: boolean }>();
const emit = defineEmits<{ saved: []; skip: [] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const school = useSchoolStore();

const fields = ['nameKm', 'nameEn', 'address', 'phone', 'directorName'] as const;
const toValues = (p: SchoolProfile) => ({
  nameKm: p.nameKm ?? '',
  nameEn: p.nameEn ?? '',
  address: p.address ?? '',
  phone: p.phone ?? '',
  directorName: p.directorName ?? '',
});

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(schoolSchema),
  initialValues: { nameKm: '', nameEn: '', address: '', phone: '', directorName: '' },
});
const submit = useSubmit({ fields: [...fields], setErrors });

const loading = ref(true);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    resetForm({ values: toValues(await school.load()) });
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

const onSubmit = handleSubmit(async (form) => {
  const saved = await submit.run(async () => {
    try {
      return await settingsApi.updateSchool({
        ...form,
        phone: khmerDigitsToAscii(form.phone),
        version: school.profile?.version ?? 0,
      });
    } catch (error) {
      if (isApiError(error) && error.code === 'OPTIMISTIC_LOCK') {
        await load(); // somebody (or another window) changed it: show what is stored now
        notify.warning(t('settings.school.reloaded'));
        return null;
      }
      throw error;
    }
  });
  if (!saved) return;
  await school.apply(saved);
  resetForm({ values: toValues(saved) }); // shows exactly what the server stored (normalised)
  notify.success(t('settings.school.saved'));
  emit('saved');
});

const digitsOnly = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <StateBlock :loading="loading" :error="loadError" @retry="load">
    <form novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <div class="row">
        <div class="col-lg-8">
          <FormInput name="nameKm" :label="t('settings.school.nameKm')" required autofocus :maxlength="200" />
          <FormInput name="nameEn" :label="t('settings.school.nameEn')" :maxlength="200" />
          <FormInput name="address" type="textarea" :rows="2" :label="t('settings.school.address')" :maxlength="500" />
          <div class="row">
            <div class="col-md-6">
              <FormInput name="phone" :label="t('settings.school.phone')" inputmode="tel" :maxlength="50" :formatter="digitsOnly" />
            </div>
            <div class="col-md-6">
              <FormInput name="directorName" :label="t('settings.school.director')" :maxlength="150" />
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <LogoUploader />
        </div>
      </div>

      <div class="wizard-actions">
        <span />
        <div class="d-flex gap-2">
          <button v-if="props.wizard" type="button" class="btn btn-outline-secondary" @click="emit('skip')">{{ t('common.skipForNow') }}</button>
          <LoadingButton type="submit" icon="check-lg" :loading="submit.submitting.value">
            {{ props.wizard ? t('common.saveAndContinue') : t('common.save') }}
          </LoadingButton>
        </div>
      </div>
    </form>
  </StateBlock>
</template>
