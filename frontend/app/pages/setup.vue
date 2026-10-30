<script setup lang="ts">
import { useSessionStore } from '~/stores/session';
import { useSetupStore } from '~/stores/setup';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const session = useSessionStore();
const setup = useSetupStore();

const loading = ref(true);
const loadError = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    await setup.init(session.isAuthenticated);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

/** Moves the wizard and saves the position on the server (once an account exists). */
async function go(target: number): Promise<void> {
  try {
    await setup.goTo(target, session.isAuthenticated);
  } catch (error) {
    notify.error(messageFor(error));
  }
}

onMounted(load);
</script>

<template>
  <div class="card auth-card is-wide">
    <div class="card-body p-4">
      <SetupStepper :current="setup.step" />
      <StateBlock :loading="loading" :error="loadError" @retry="load">
        <h2 class="h4 mt-4">{{ t(`setup.titles.${setup.step}`) }}</h2>
        <StepWelcome v-if="setup.step === 1" @next="go(2)" />
        <StepAdmin v-else-if="setup.step === 2" @next="go(3)" @back="go(1)" />
        <StepRecoveryKey v-else-if="setup.step === 3" @next="go(4)" />
        <StepSchool v-else-if="setup.step === 4" @next="go(5)" />
        <StepAcademic v-else-if="setup.step === 5" @next="go(6)" @back="go(4)" />
        <StepPreferences v-else-if="setup.step === 6" @next="go(7)" @back="go(5)" />
        <StepFinish v-else @back="go(6)" />
      </StateBlock>
    </div>
  </div>
</template>
