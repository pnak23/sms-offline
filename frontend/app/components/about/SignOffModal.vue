<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { acceptanceApi } from '~/services/acceptanceApi';
import { useAcceptanceStore } from '~/stores/acceptance';
import type { AcceptanceItem } from '~/types/api';

// The administrator says "I checked this for the school". It is deliberate: a confirmation box, a note, and an audit entry. The program
// never does this by itself, and it cannot be done for an item whose development is not finished.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ item: AcceptanceItem | null }>();
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const acceptance = useAcceptanceStore();

const note = ref('');
const confirmed = ref(false);
const saving = ref(false);
const problem = ref<string | null>(null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  note.value = '';
  confirmed.value = false;
  problem.value = null;
});

async function submit(): Promise<void> {
  if (!props.item || !confirmed.value) return;
  saving.value = true;
  problem.value = null;
  try {
    await acceptanceApi.signOff(props.item.id, note.value.trim() === '' ? null : note.value.trim());
    await acceptance.load();
    notify.success(t('acceptance.signedOff'));
    open.value = false;
    emit('done');
  } catch (error) {
    problem.value = messageFor(error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BModal v-model="open" :title="t('acceptance.signModal.title')" lazy unmount-lazy centered no-close-on-backdrop :no-close-on-esc="saving">
    <div v-if="item" data-testid="signoff-modal">
      <p class="fw-semibold">{{ t(`acceptance.item.${item.id}.title`) }}</p>
      <p>{{ t('acceptance.signModal.explain') }}</p>
      <label class="form-label" for="signoff-note">{{ t('acceptance.signModal.note') }}</label>
      <textarea id="signoff-note" v-model="note" class="form-control mb-3" rows="3" maxlength="300" data-testid="signoff-note" />
      <div class="form-check">
        <input id="signoff-confirm" v-model="confirmed" class="form-check-input" type="checkbox" data-testid="signoff-confirm" />
        <label class="form-check-label" for="signoff-confirm">{{ t('acceptance.signModal.confirm') }}</label>
      </div>
      <div v-if="problem" class="alert alert-danger mt-3 mb-0" role="alert">{{ problem }}</div>
    </div>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton icon="check-lg" :loading="saving" :disabled="!confirmed" data-testid="signoff-submit" @click="submit">{{ t('acceptance.signModal.submit') }}</LoadingButton>
    </template>
  </BModal>
</template>
