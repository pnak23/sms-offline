<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { adminSchema } from '~/schemas/auth';
import { authApi } from '~/services/authApi';
import { useAppStore } from '~/stores/app';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';
import { useSessionStore } from '~/stores/session';
import { isApiError } from '~/utils/apiError';
import { ROUTES } from '~/utils/guards';

// Wizard step 2: the administrator. Nothing here is a default: the owner chooses their own username and password.
const emit = defineEmits<{ next: []; back: [] }>();

const { t } = useI18n();
const notify = useNotify();
const app = useAppStore();
const session = useSessionStore();
const recoveryKey = useRecoveryKeyStore();

const empty = { displayName: '', username: '', password: '', confirmPassword: '' };
const { handleSubmit, setErrors, resetForm, values } = useForm({ validationSchema: toTypedSchema(adminSchema), initialValues: empty });
const submit = useSubmit({ fields: Object.keys(empty), setErrors });

const onSubmit = handleSubmit(async (form) => {
  const result = await submit.run(async () => {
    try {
      return await authApi.setup({ displayName: form.displayName, username: form.username, password: form.password });
    } catch (error) {
      if (isApiError(error) && error.code === 'SETUP_ALREADY_DONE') {
        notify.warning(t('error.SETUP_ALREADY_DONE'));
        await app.refreshStatus();
        await navigateTo(ROUTES.login, { replace: true });
        return null;
      }
      throw error;
    }
  });
  if (!result) return;
  resetForm({ values: empty }); // the passwords leave the form before the wizard moves on
  session.begin(result.token, result.user);
  recoveryKey.issue(result.recoveryKey, ROUTES.setup);
  await app.refreshStatus();
  emit('next');
});
</script>

<template>
  <form novalidate @submit.prevent="onSubmit">
    <p class="text-muted">{{ t('setup.admin.intro') }}</p>
    <FormAlert :message="submit.formError.value" />

    <div class="row">
      <div class="col-md-6">
        <FormInput name="displayName" :label="t('setup.admin.displayName')" autocomplete="name" autofocus required :maxlength="100" />
      </div>
      <div class="col-md-6">
        <FormInput name="username" :label="t('auth.username')" autocomplete="username" required :maxlength="100" :hint="t('setup.admin.usernameHint')" />
      </div>
      <div class="col-md-6">
        <FormInput
          name="password"
          type="password"
          :label="t('auth.password')"
          autocomplete="new-password"
          required
          :hint="t('auth.passwordRules')"
        >
          <PasswordStrength :password="values.password ?? ''" :username="values.username" />
        </FormInput>
      </div>
      <div class="col-md-6">
        <FormInput name="confirmPassword" type="password" :label="t('auth.confirmPassword')" autocomplete="new-password" required />
      </div>
    </div>

    <div class="wizard-actions">
      <button type="button" class="btn btn-outline-secondary" @click="emit('back')"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
      <LoadingButton type="submit" icon="arrow-right" :loading="submit.submitting.value">{{ t('setup.admin.create') }}</LoadingButton>
    </div>
  </form>
</template>
