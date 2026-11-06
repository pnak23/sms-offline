<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { feeVoidSchema } from '~/schemas/fees';
import { feesApi } from '~/services/feesApi';
import type { FeePayment } from '~/types/api';
import { formatMoney } from '~/utils/money';

// Void a payment made by mistake. It is never deleted: the receipt number stays on record, marked void, with the reason given here.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ payment: FeePayment | null }>();
const emit = defineEmits<{ saved: []; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(feeVoidSchema), initialValues: { reason: '' } });
const submit = useSubmit({ fields: ['reason'], setErrors });

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  resetForm({ values: { reason: '' } });
});

const onSubmit = handleSubmit(async (form) => {
  const payment = props.payment;
  if (!payment) return;
  const done = await submit.run(() => feesApi.voidPayment(payment.id, form.reason));
  if (!done) {
    if (submit.lastError.value?.code === 'ALREADY_VOIDED' || submit.lastError.value?.code === 'NOT_FOUND') {
      notify.warning(t('fees.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t('fees.paymentVoided', { receipt: payment.receiptNo }));
  open.value = false;
  emit('saved');
});
</script>

<template>
  <BModal v-model="open" :title="t('fees.voidTitle', { receipt: payment?.receiptNo ?? '' })" centered no-close-on-backdrop>
    <form id="fee-void-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <p v-if="payment" class="text-muted">{{ t('fees.voidHelp', { amount: formatMoney(payment.amount, payment.currency) }) }}</p>
      <FormInput name="reason" :label="t('fees.voidReason')" required :maxlength="200" autofocus />
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="fee-void-form" variant="danger" icon="check-lg" :loading="submit.submitting.value">{{ t('fees.voidConfirm') }}</LoadingButton>
    </template>
  </BModal>
</template>
