<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { currentPasswordSchema } from '~/schemas/auth';
import { authApi } from '~/services/authApi';
import { useAppStore } from '~/stores/app';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';

/**
 * Issue a NEW recovery key (the old one stops working at once): ask for the current password, show the key in the
 * RecoveryKeyPanel, confirm. Used by Settings -> Security and by the forced page after an unconfirmed key.
 * The state is driven by the recoveryKey store, so it survives the trip to the print page and back.
 */
defineProps<{ hideIntro?: boolean; autofocus?: boolean }>();
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();
const route = useRoute();
const app = useAppStore();
const recoveryKey = useRecoveryKeyStore();
const notify = useNotify();

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(currentPasswordSchema),
  initialValues: { currentPassword: '' },
});
const regenerate = useSubmit({ fields: ['currentPassword'], setErrors });
const confirming = useSubmit({ fields: [] });
const confirmError = computed(() => confirming.formError.value);

const onRegenerate = handleSubmit(async (values) => {
  const result = await regenerate.run(() => authApi.regenerateRecoveryKey(values.currentPassword));
  if (!result) return;
  resetForm({ values: { currentPassword: '' } }); // the password is not kept around
  recoveryKey.issue(result.recoveryKey, route.path);
  await app.refreshStatus(); // the server now reports the key as unconfirmed
});

async function onConfirm(): Promise<void> {
  const ok = await confirming.run(async () => {
    await authApi.confirmRecoveryKey();
    return true;
  });
  if (!ok) return;
  recoveryKey.clear();
  await app.refreshStatus();
  notify.success(t('recovery.confirmedToast'));
  emit('done');
}
</script>

<template>
  <div>
    <RecoveryKeyPanel v-if="recoveryKey.hasKey" :busy="confirming.submitting.value" :error="confirmError" @confirm="onConfirm" />

    <form v-else novalidate @submit.prevent="onRegenerate">
      <p v-if="!hideIntro">{{ t('security.regenerate.intro') }}</p>
      <FormAlert
        :message="regenerate.formError.value"
        :locked-seconds="regenerate.lockedSeconds.value"
        :lock-label="regenerate.lockLabel.value"
      />
      <FormInput
        name="currentPassword"
        type="password"
        :label="t('security.currentPassword')"
        autocomplete="current-password"
        :autofocus="autofocus"
        :disabled="regenerate.isLocked.value"
      />
      <LoadingButton type="submit" icon="key" :loading="regenerate.submitting.value" :disabled="regenerate.isLocked.value">
        {{ t('security.regenerate.action') }}
      </LoadingButton>
    </form>
  </div>
</template>
