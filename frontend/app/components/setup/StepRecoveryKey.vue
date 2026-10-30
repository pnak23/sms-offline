<script setup lang="ts">
import { authApi } from '~/services/authApi';
import { useAppStore } from '~/stores/app';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';

// Wizard step 3: the recovery key. Cannot be skipped; the wizard only moves on once the server has the confirmation.
const emit = defineEmits<{ next: [] }>();

const { t } = useI18n();
const app = useAppStore();
const recoveryKey = useRecoveryKeyStore();
const confirming = useSubmit({ fields: [] });

async function onConfirm(): Promise<void> {
  const ok = await confirming.run(async () => {
    await authApi.confirmRecoveryKey();
    return true;
  });
  if (!ok) return;
  recoveryKey.clear();
  await app.refreshStatus();
  emit('next');
}
</script>

<template>
  <div>
    <p>{{ t('setup.recoveryKey.intro') }}</p>
    <RecoveryKeyPanel :busy="confirming.submitting.value" :error="confirming.formError.value" @confirm="onConfirm" />
  </div>
</template>
