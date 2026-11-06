<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { reportCardsApi } from '~/services/reportCardsApi';
import type { ReportCard } from '~/types/api';

// The teacher's comment on one report card. Saving an empty box removes the comment.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ card: ReportCard | null }>();
const emit = defineEmits<{ saved: []; stale: [] }>();

const MAX = 1000;

const { t } = useI18n();
const notify = useNotify();
const submit = useSubmit({ fields: [] });

const text = ref('');
const tooLong = computed(() => text.value.trim().length > MAX);

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  text.value = props.card?.comment ?? '';
});

async function save(): Promise<void> {
  const card = props.card;
  if (!card || tooLong.value) return;
  const done = await submit.run(async () => {
    await reportCardsApi.saveComment(card.examinationId, card.enrollmentId, text.value.trim());
    return true;
  });
  if (!done) {
    if (submit.lastError.value?.code === 'ACADEMIC_YEAR_CLOSED') {
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t('reportCards.commentSaved'));
  open.value = false;
  emit('saved');
}
</script>

<template>
  <BModal v-model="open" :title="t('reportCards.commentTitle', { name: card?.nameKm ?? '' })" size="lg" centered no-close-on-backdrop>
    <form id="comment-form" novalidate @submit.prevent="save">
      <FormAlert :message="submit.formError.value" />
      <label for="report-comment" class="form-label">{{ t('reportCards.comment') }}</label>
      <textarea id="report-comment" v-model="text" class="form-control" :class="{ 'is-invalid': tooLong }" rows="5" autocomplete="off" spellcheck="false" />
      <div class="form-text" :class="{ 'text-danger': tooLong }">{{ t('reportCards.commentCount', { count: text.trim().length, max: MAX }) }}</div>
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="comment-form" icon="check-lg" :loading="submit.submitting.value" :disabled="tooLong">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
