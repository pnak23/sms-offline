<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { createChangePasswordSchema } from '~/schemas/auth';
import { authApi } from '~/services/authApi';
import { useSessionStore } from '~/stores/session';

// Change the password: needs the current one; the server signs every OTHER session out and keeps this one.
const { t } = useI18n();
const notify = useNotify();
const session = useSessionStore();

const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };
const { handleSubmit, setErrors, resetForm, values } = useForm({
  validationSchema: toTypedSchema(createChangePasswordSchema(() => session.user?.username)),
  initialValues: empty,
});
const submit = useSubmit({ fields: Object.keys(empty), setErrors });

const onSubmit = handleSubmit(async (form) => {
  const ok = await submit.run(async () => {
    await authApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
    return true;
  });
  if (!ok) return;
  resetForm({ values: empty });
  notify.success(t('security.password.changed'));
});
</script>

<template>
  <form novalidate @submit.prevent="onSubmit">
    <FormAlert :message="submit.formError.value" :locked-seconds="submit.lockedSeconds.value" :lock-label="submit.lockLabel.value" />
    <FormInput
      name="currentPassword"
      type="password"
      :label="t('security.currentPassword')"
      autocomplete="current-password"
      autofocus
      :disabled="submit.isLocked.value"
    />
    <FormInput
      name="newPassword"
      type="password"
      :label="t('security.password.new')"
      autocomplete="new-password"
      :disabled="submit.isLocked.value"
      :hint="t('auth.passwordRules')"
    >
      <PasswordStrength :password="values.newPassword ?? ''" :username="session.user?.username" />
    </FormInput>
    <FormInput
      name="confirmPassword"
      type="password"
      :label="t('auth.confirmPassword')"
      autocomplete="new-password"
      :disabled="submit.isLocked.value"
    />
    <LoadingButton type="submit" icon="check-lg" :loading="submit.submitting.value" :disabled="submit.isLocked.value">
      {{ t('security.password.submit') }}
    </LoadingButton>
  </form>
</template>
