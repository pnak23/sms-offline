<script setup lang="ts">
import { authApi } from '~/services/authApi';
import { useAppStore } from '~/stores/app';
import { useRecoveryStore } from '~/stores/recovery';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';
import { useSessionStore } from '~/stores/session';
import { ROUTES } from '~/utils/guards';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const app = useAppStore();
const session = useSessionStore();
const recovery = useRecoveryStore();
const recoveryKey = useRecoveryKeyStore();
const finishing = useSubmit({ fields: [] });

// Whatever the way out (except the print page), the held password and key leave memory.
onBeforeRouteLeave((to) => {
  if (to.path === ROUTES.printRecoveryKey) return;
  recoveryKey.clear();
  recovery.reset();
});

// Recovery revokes every session, so the new password signs in once more to confirm the new key, then everything is wiped.
async function onConfirm(): Promise<void> {
  const ok = await finishing.run(async () => {
    if (!session.isAuthenticated) await session.login(recovery.username, recovery.newPassword);
    await authApi.confirmRecoveryKey();
    return true;
  });
  if (!ok) return;
  recoveryKey.clear();
  recovery.reset();
  await app.refreshStatus();
  await navigateTo(ROUTES.home, { replace: true });
}
</script>

<template>
  <div class="card auth-card" :class="{ 'is-wide': recovery.phase === 'key' }">
    <RecoverForm v-if="recovery.phase === 'form'" />

    <div v-else class="card-body p-4">
      <div class="alert alert-success" role="status">
        <AppIcon name="check-circle-fill" class="mt-1" />
        <div>
          <div class="fw-semibold">{{ t('auth.recover.done') }}</div>
          <div>{{ t('auth.recover.yourUsername') }} <strong class="username-chip">{{ recovery.username }}</strong></div>
        </div>
      </div>
      <h2 class="h5">{{ t('auth.recover.newKeyTitle') }}</h2>
      <p>{{ t('auth.recover.newKeyBody') }}</p>
      <RecoveryKeyPanel
        :busy="finishing.submitting.value"
        :error="finishing.formError.value"
        :continue-label="t('auth.recover.continue')"
        @confirm="onConfirm"
      />
    </div>
  </div>
</template>
