<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { IDLE_LOCK_RANGE, preferencesSchema, REMINDER_DAYS_RANGE } from '~/schemas/preferences';
import { usePreferencesStore } from '~/stores/preferences';
import { khmerDigitsToAscii, parseWholeNumber } from '~/utils/khmer';

// Wizard step 6 and the preferences block of Settings: backup reminder interval and idle-lock minutes.
const emit = defineEmits<{ next: []; back: [] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const preferences = usePreferencesStore();

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(preferencesSchema),
  initialValues: { reminderDays: '7', idleLockMinutes: '10' },
});
// The server reports bad values under the setting keys (INVALID_SETTING).
const submit = useSubmit({
  fields: ['reminderDays', 'idleLockMinutes'],
  setErrors,
  aliases: { 'backup.reminderDays': 'reminderDays', 'ui.idleLockMinutes': 'idleLockMinutes' },
});

const loading = ref(true);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    await preferences.load();
    resetForm({ values: { reminderDays: String(preferences.backupReminderDays), idleLockMinutes: String(preferences.idleLockMinutes) } });
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

const onSubmit = handleSubmit(async (form) => {
  const ok = await submit.run(async () => {
    await preferences.save({
      'backup.reminderDays': String(parseWholeNumber(form.reminderDays)),
      'ui.idleLockMinutes': String(parseWholeNumber(form.idleLockMinutes)),
    });
    return true;
  });
  if (ok) emit('next');
});

const asciiDigits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });

onMounted(load);
</script>

<template>
  <StateBlock :loading="loading" :error="loadError" @retry="load">
    <form novalidate @submit.prevent="onSubmit">
      <p class="text-muted">{{ t('setup.preferences.intro') }}</p>
      <FormAlert :message="submit.formError.value" />

      <div class="row">
        <div class="col-md-6">
          <FormInput
            name="reminderDays"
            :label="t('setup.preferences.reminderDays')"
            inputmode="numeric"
            :maxlength="3"
            :formatter="asciiDigits"
            autofocus
            :hint="t('setup.preferences.reminderHint', REMINDER_DAYS_RANGE)"
          />
        </div>
        <div class="col-md-6">
          <FormInput
            name="idleLockMinutes"
            :label="t('setup.preferences.idleLock')"
            inputmode="numeric"
            :maxlength="3"
            :formatter="asciiDigits"
            :hint="t('setup.preferences.idleLockHint', IDLE_LOCK_RANGE)"
          />
        </div>
      </div>

      <div class="mb-3">
        <label class="form-label">{{ t('setup.preferences.backupFolder') }}</label>
        <div class="d-flex align-items-center gap-3 flex-wrap">
          <button type="button" class="btn btn-outline-secondary" disabled><AppIcon name="folder2-open" />{{ t('setup.preferences.chooseFolder') }}</button>
          <span class="text-muted small">{{ t('setup.preferences.chooseLater') }}</span>
        </div>
      </div>

      <div class="wizard-actions">
        <button type="button" class="btn btn-outline-secondary" @click="emit('back')"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
        <LoadingButton type="submit" icon="arrow-right" :loading="submit.submitting.value">{{ t('common.saveAndContinue') }}</LoadingButton>
      </div>
    </form>
  </StateBlock>
</template>
