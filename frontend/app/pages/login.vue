<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { loginSchema } from '~/schemas/auth';
import { useAppStore } from '~/stores/app';
import { useSessionStore } from '~/stores/session';
import { ROUTES } from '~/utils/guards';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const app = useAppStore();
const session = useSessionStore();
const notice = app.takeNotice(); // shown once, e.g. after the session expired
const restored = useRoute().query.restored === '1'; // the page was reloaded after a restore (nothing from before it stays in memory)

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: { username: '', password: '' },
});
const submit = useSubmit({ fields: ['username', 'password'], setErrors });
const passwordField = ref<{ focus: () => void } | null>(null);

const onSubmit = handleSubmit(async (values) => {
  const ok = await submit.run(async () => {
    await session.login(values.username, values.password);
    return true;
  });
  resetForm({ values: { username: values.username, password: '' } }); // the password never stays in the form
  if (!ok) {
    await nextTick();
    passwordField.value?.focus();
    return;
  }
  await app.refreshStatus();
  await navigateTo(ROUTES.home, { replace: true }); // the route guard picks the right page (key obligation, wizard, dashboard)
});
</script>

<template>
  <div class="card auth-card">
    <form class="card-body p-4" novalidate @submit.prevent="onSubmit">
      <h2 class="h4 mb-3">{{ t('auth.login.title') }}</h2>

      <div v-if="notice" class="alert alert-info" role="status">
        <AppIcon name="info-circle-fill" class="mt-1" /><div>{{ t(`auth.notice.${notice}`) }}</div>
      </div>
      <div v-if="restored" class="alert alert-success" role="status" data-testid="restored-notice">
        <AppIcon name="check-circle-fill" class="mt-1" /><div>{{ t('auth.notice.RESTORED') }}</div>
      </div>
      <FormAlert :message="submit.formError.value" :locked-seconds="submit.lockedSeconds.value" :lock-label="submit.lockLabel.value" />

      <FormInput
        name="username"
        :label="t('auth.username')"
        autocomplete="username"
        autofocus
        :disabled="submit.isLocked.value"
      />
      <FormInput
        ref="passwordField"
        name="password"
        type="password"
        :label="t('auth.password')"
        autocomplete="current-password"
        :disabled="submit.isLocked.value"
      />

      <LoadingButton type="submit" class="w-100 mt-1" size="lg" :loading="submit.submitting.value" :disabled="submit.isLocked.value">
        {{ t('auth.login.submit') }}
      </LoadingButton>

      <div class="text-center mt-3">
        <NuxtLink :to="ROUTES.recover">{{ t('auth.login.forgot') }}</NuxtLink>
      </div>
    </form>
  </div>
</template>
