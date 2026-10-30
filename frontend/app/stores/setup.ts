import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { setupApi } from '../services/setupApi';
import { resumeStep } from '../utils/guards';

export const SETUP_STEP_COUNT = 7;
/** Steps 1-3 (checks, administrator, recovery key) are finished once the account exists and its key is confirmed. */
export const FIRST_RESUMABLE_STEP = 4;

/** Wizard state. The step is mirrored to the server (PUT /setup/progress) once an account exists, never to the browser. */
export const useSetupStore = defineStore('setup', () => {
  const step = ref(1);
  const initialised = ref(false);
  /** Set by steps 4 and 5 so the last step can say what was skipped (the account itself is read from the session). */
  const schoolSkipped = ref(false);
  const academicSkipped = ref(false);

  const isLastStep = computed(() => step.value === SETUP_STEP_COUNT);

  /**
   * Called when the wizard page opens. A signed-in user (account exists) resumes at the saved step, never earlier than
   * step 4; before any account exists the wizard starts at step 1. In-flight state is kept when returning from /print.
   */
  async function init(signedIn: boolean): Promise<void> {
    if (initialised.value) return;
    if (signedIn) {
      const saved = await setupApi.progress();
      step.value = step.value >= FIRST_RESUMABLE_STEP ? step.value : resumeStep(saved.step);
    }
    initialised.value = true;
  }

  async function persist(target: number, signedIn: boolean): Promise<void> {
    if (signedIn) await setupApi.saveProgress(target);
  }

  /** Move to `target` and remember it on the server (when an account exists). */
  async function goTo(target: number, signedIn: boolean): Promise<void> {
    const clamped = Math.min(SETUP_STEP_COUNT, Math.max(1, target));
    await persist(clamped, signedIn);
    step.value = clamped;
  }

  function reset(): void {
    step.value = 1;
    initialised.value = false;
    schoolSkipped.value = false;
    academicSkipped.value = false;
  }

  return { step, initialised, schoolSkipped, academicSkipped, isLastStep, init, goTo, reset };
});
