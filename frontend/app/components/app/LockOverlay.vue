<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { unlockSchema } from '~/schemas/auth';
import { useSessionStore } from '~/stores/session';

// Full-screen lock. The page underneath stays mounted (and inert), so half-typed forms survive an idle lock.
const { t } = useI18n();
const session = useSessionStore();
const signOut = useSignOut();

const { handleSubmit, setErrors, resetForm } = useForm({
  validationSchema: toTypedSchema(unlockSchema),
  initialValues: { password: '' },
});
const submit = useSubmit({ fields: ['password'], setErrors });

const previouslyFocused = document.activeElement as HTMLElement | null;

const onSubmit = handleSubmit(async (values) => {
  const done = await submit.run(async () => {
    await session.unlock(values.password);
    return true;
  });
  if (!done) return; // a wrong password stays in the field (with its error) so a typo can be fixed
  resetForm({ values: { password: '' } });
  previouslyFocused?.focus?.();
});
</script>

<template>
  <div class="lock-overlay" role="dialog" aria-modal="true" :aria-label="t('lock.title')">
    <form class="card lock-card" novalidate @submit.prevent="onSubmit">
      <div class="card-body">
        <div class="lock-icon"><AppIcon name="lock-fill" /></div>
        <h2 class="h4 text-center">{{ t('lock.title') }}</h2>
        <p class="text-center text-muted">{{ t('lock.body', { name: session.user?.displayName ?? '' }) }}</p>

        <FormAlert :message="submit.formError.value" :locked-seconds="submit.lockedSeconds.value" :lock-label="submit.lockLabel.value" />

        <FormInput
          name="password"
          type="password"
          :label="t('auth.password')"
          autocomplete="current-password"
          autofocus
          :disabled="submit.isLocked.value"
        />

        <LoadingButton type="submit" class="w-100" :loading="submit.submitting.value" :disabled="submit.isLocked.value" icon="unlock">
          {{ t('lock.unlock') }}
        </LoadingButton>
        <div class="text-center mt-3">
          <button type="button" class="btn btn-link" @click="signOut">{{ t('nav.signOut') }}</button>
        </div>
      </div>
    </form>
  </div>
</template>
