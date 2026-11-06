<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { IDLE_LOCK_RANGE, preferencesSchema, REMINDER_DAYS_RANGE } from '~/schemas/preferences';
import { usePreferencesStore } from '~/stores/preferences';
import { khmerDigitsToAscii, parseWholeNumber } from '~/utils/khmer';

// Wizard step 6 and Settings -> Preferences (`standalone`: no wizard buttons, a Save button, emits `saved`):
// the optional reminder to copy a backup to a USB stick (off by default) and idle-lock minutes. Backups themselves are kept on this laptop and made by the program.
const props = defineProps<{ standalone?: boolean }>();
const emit = defineEmits<{ next: []; back: []; saved: [] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const preferences = usePreferencesStore();

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(preferencesSchema),
  initialValues: { reminderDays: '0', idleLockMinutes: '10' },
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
  if (!ok) return;
  if (props.standalone) emit('saved');
  else emit('next');
});

const asciiDigits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });

onMounted(load);
</script>

<template>
  <StateBlock :loading="loading" :error="loadError" @retry="load">
    <form novalidate @submit.prevent="onSubmit">
      <p v-if="!standalone" class="text-muted">{{ t('setup.preferences.intro') }}</p>
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

      <p class="text-muted small" data-testid="backup-where">{{ t('setup.preferences.backupWhere') }}</p>

      <div v-if="standalone">
        <LoadingButton type="submit" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
      </div>
      <div v-else class="wizard-actions">
        <button type="button" class="btn btn-outline-secondary" @click="emit('back')"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
        <LoadingButton type="submit" icon="arrow-right" :loading="submit.submitting.value">{{ t('common.saveAndContinue') }}</LoadingButton>
      </div>
    </form>
  </StateBlock>
</template>
