<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { recoverSchema } from '~/schemas/auth';
import { authApi } from '~/services/authApi';
import { useRecoveryStore } from '~/stores/recovery';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';
import { formatWithCaret } from '~/utils/recoveryKey';

// "Forgot password": the recovery key proves ownership; the server answers with the username and a NEW key.
const { t } = useI18n();
const recovery = useRecoveryStore();
const recoveryKey = useRecoveryKeyStore();

const { handleSubmit, setErrors, resetForm, values } = useForm({
  validationSchema: toTypedSchema(recoverSchema),
  initialValues: { recoveryKey: '', newPassword: '', confirmPassword: '' },
});
const submit = useSubmit({ fields: ['recoveryKey', 'newPassword', 'confirmPassword'], setErrors });

const onSubmit = handleSubmit(async (form) => {
  const result = await submit.run(() => authApi.recover({ recoveryKey: form.recoveryKey, newPassword: form.newPassword }));
  if (!result) return; // on a failure the entries stay, so a typo can be fixed
  recoveryKey.issue(result.recoveryKey, '/recover');
  recovery.begin(result, form.newPassword);
  resetForm({ values: { recoveryKey: '', newPassword: '', confirmPassword: '' } }); // key and passwords leave the form at once
});
</script>

<template>
  <form class="card-body p-4" novalidate @submit.prevent="onSubmit">
    <h2 class="h4">{{ t('auth.recover.title') }}</h2>
    <p class="text-muted">{{ t('auth.recover.intro') }}</p>

    <FormAlert :message="submit.formError.value" :locked-seconds="submit.lockedSeconds.value" :lock-label="submit.lockLabel.value" />

    <FormInput
      name="recoveryKey"
      :label="t('auth.recover.key')"
      placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
      :formatter="formatWithCaret"
      monospace
      autofocus
      :disabled="submit.isLocked.value"
      :hint="t('auth.recover.keyHint')"
    />
    <FormInput
      name="newPassword"
      type="password"
      :label="t('auth.recover.newPassword')"
      autocomplete="new-password"
      :disabled="submit.isLocked.value"
      :hint="t('auth.passwordRules')"
    >
      <PasswordStrength :password="values.newPassword ?? ''" />
    </FormInput>
    <FormInput
      name="confirmPassword"
      type="password"
      :label="t('auth.confirmPassword')"
      autocomplete="new-password"
      :disabled="submit.isLocked.value"
    />

    <LoadingButton type="submit" class="w-100" size="lg" :loading="submit.submitting.value" :disabled="submit.isLocked.value" icon="key">
      {{ t('auth.recover.submit') }}
    </LoadingButton>
    <div class="text-center mt-3">
      <NuxtLink to="/login">{{ t('auth.recover.back') }}</NuxtLink>
    </div>
  </form>
</template>
