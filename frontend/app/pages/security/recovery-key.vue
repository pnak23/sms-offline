<script setup lang="ts">
import { ROUTES } from '~/utils/guards';

// Forced page: the account's recovery key was never confirmed as saved. The old key cannot be shown again,
// so the only way forward is to issue a new one (current password), save it and confirm.
definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const signOut = useSignOut();

async function onDone(): Promise<void> {
  await navigateTo(ROUTES.home, { replace: true }); // the guard continues the wizard or opens the dashboard
}
</script>

<template>
  <div class="card auth-card is-wide">
    <div class="card-body p-4">
      <h2 class="h4">{{ t('security.forced.title') }}</h2>
      <div class="alert alert-warning" role="note">
        <AppIcon name="exclamation-triangle-fill" class="mt-1" />
        <div>{{ t('security.forced.explain') }}</div>
      </div>
      <RegenerateKeyFlow hide-intro autofocus @done="onDone" />
      <div class="text-center mt-3">
        <button type="button" class="btn btn-link" @click="signOut">{{ t('nav.signOut') }}</button>
      </div>
    </div>
  </div>
</template>
