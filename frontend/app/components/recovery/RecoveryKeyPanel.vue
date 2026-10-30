<script setup lang="ts">
import { useRecoveryKeyStore } from '~/stores/recoveryKey';
import { ROUTES } from '~/utils/guards';
import { matchesFirstGroup, normalizeRecoveryKey, RECOVERY_KEY_GROUP } from '~/utils/recoveryKey';

/**
 * Shows the recovery key held in the recoveryKey store and makes the user prove they saved it: tick "I have saved it"
 * AND retype the first group. There is deliberately no copy button (clipboard history) and no way to skip. The host
 * page performs POST /auth/recovery-key/confirm when this panel emits `confirm`.
 */
defineProps<{
  /** The host's confirm request is running. */
  busy?: boolean;
  /** Text of the continue button (defaults to "Continue"). */
  continueLabel?: string;
  /** Already translated failure of the host's confirm request. */
  error?: string | null;
}>();

const emit = defineEmits<{ confirm: [] }>();

const { t } = useI18n();
const store = useRecoveryKeyStore();
const route = useRoute();

const saved = ref(false);
const typed = ref('');

const groups = computed(() => (store.key ?? '').split('-'));
const groupMatches = computed(() => !!store.key && matchesFirstGroup(store.key, typed.value));
const canContinue = computed(() => saved.value && groupMatches.value);

function onTyped(event: Event): void {
  const el = event.target as HTMLInputElement;
  typed.value = normalizeRecoveryKey(el.value).slice(0, RECOVERY_KEY_GROUP);
  el.value = typed.value;
}

async function openPrintPage(): Promise<void> {
  store.setReturnTo(route.path);
  await navigateTo(ROUTES.printRecoveryKey);
}

function onContinue(): void {
  if (canContinue.value) emit('confirm');
}

</script>

<template>
  <div class="recovery-panel">
    <div class="alert alert-warning" role="note">
      <AppIcon name="exclamation-triangle-fill" class="mt-1" />
      <div>
        <div class="fw-semibold">{{ t('recovery.warnTitle') }}</div>
        <div>{{ t('recovery.warnBody') }}</div>
      </div>
    </div>

    <div class="recovery-key-block" :aria-label="t('recovery.keyLabel')" @copy.prevent @contextmenu.prevent>
      <span v-for="(group, index) in groups" :key="index" class="recovery-key-group">{{ group }}</span>
    </div>

    <div class="d-flex gap-2 justify-content-center mb-4">
      <button type="button" class="btn btn-outline-primary" @click="openPrintPage">
        <AppIcon name="printer" />{{ t('recovery.printOrPdf') }}
      </button>
    </div>
    <p class="text-muted text-center small">{{ t('recovery.noCopyNote') }}</p>

    <div class="form-check mb-3">
      <input id="recovery-saved" v-model="saved" type="checkbox" class="form-check-input" />
      <label for="recovery-saved" class="form-check-label">{{ t('recovery.savedCheck') }}</label>
    </div>

    <div class="mb-3">
      <label for="recovery-retype" class="form-label">{{ t('recovery.retypeLabel') }}</label>
      <div class="input-group retype-group">
        <input
          id="recovery-retype"
          :value="typed"
          class="form-control font-monospace text-uppercase"
          :class="{ 'is-valid': groupMatches, 'is-invalid': typed.length >= RECOVERY_KEY_GROUP && !groupMatches }"
          :maxlength="RECOVERY_KEY_GROUP + 1"
          autocomplete="off"
          spellcheck="false"
          :aria-describedby="'recovery-retype-hint'"
          @input="onTyped"
          @keydown.enter.prevent="onContinue"
        />
        <span v-if="groupMatches" class="input-group-text text-success"><AppIcon name="check-circle-fill" /></span>
      </div>
      <div id="recovery-retype-hint" class="form-text">{{ t('recovery.retypeHint') }}</div>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">
      <AppIcon name="exclamation-circle" class="mt-1" /><div>{{ error }}</div>
    </div>

    <LoadingButton class="w-100" :loading="busy" :disabled="!canContinue" icon="check-lg" @click="onContinue">
      {{ continueLabel ?? t('recovery.continue') }}
    </LoadingButton>
  </div>
</template>
