<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { feePaymentSchema, PAYMENT_METHODS } from '~/schemas/fees';
import { feesApi } from '~/services/feesApi';
import type { FeeCharge, FeePayment, PaymentMethod } from '~/types/api';
import { todayIso } from '~/utils/date';
import { khmerDigitsToAscii } from '~/utils/khmer';
import { formatMoney, parseMoney } from '~/utils/money';

// Record money received for one charge. The amount starts as what is still due and can never be more than that; a mistake is voided later,
// never deleted. The answer carries the receipt number, which the page offers to print.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ charge: FeeCharge | null }>();
const emit = defineEmits<{ saved: [payment: FeePayment]; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

const blank = () => ({ amount: '', paidOn: todayIso(), method: 'CASH', reference: '' });
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(feePaymentSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['amount', 'paidOn', 'method', 'reference'], setErrors });

const methods = computed(() => PAYMENT_METHODS.map((m) => ({ value: m, label: t(`fees.method.${m}`) })));

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  resetForm({ values: { ...blank(), amount: props.charge ? String(props.charge.balance) : '' } });
});

const onSubmit = handleSubmit(async (form) => {
  const charge = props.charge;
  if (!charge) return;
  const amount = parseMoney(form.amount, charge.currency);
  if (Number.isNaN(amount)) {
    setErrors({ amount: 'INVALID_NUMBER' });
    return;
  }
  if (amount > charge.balance) {
    setErrors({ amount: 'OVERPAYMENT' });
    return;
  }
  const paid = await submit.run(() => feesApi.pay(charge.id, { amount, paidOn: form.paidOn, method: form.method as PaymentMethod, reference: form.reference || null }));
  if (!paid) {
    if (submit.lastError.value?.code === 'NOT_FOUND') {
      notify.warning(t('fees.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t('fees.paymentRecorded', { receipt: paid.receiptNo }));
  open.value = false;
  emit('saved', paid);
});

const digits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });
</script>

<template>
  <BModal v-model="open" :title="t('fees.payTitle', { category: charge?.categoryName ?? '' })" centered no-close-on-backdrop>
    <form id="fee-payment-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <p v-if="charge" class="text-muted">{{ t('fees.stillDue', { amount: formatMoney(charge.balance, charge.currency) }) }}</p>
      <div class="row">
        <div class="col-md-6"><FormInput name="amount" :label="t('fees.amountPaid')" required inputmode="decimal" :maxlength="16" :formatter="digits" autofocus /></div>
        <div class="col-md-6"><FormInput name="paidOn" type="date" :label="t('fees.paidOn')" required /></div>
      </div>
      <div class="row">
        <div class="col-md-6"><FormSelect name="method" :label="t('fees.methodLabel')" required :options="methods" /></div>
        <div class="col-md-6"><FormInput name="reference" :label="t('fees.reference')" :maxlength="100" :hint="t('fees.referenceHint')" /></div>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="fee-payment-form" icon="check-lg" :loading="submit.submitting.value">{{ t('fees.recordPayment') }}</LoadingButton>
    </template>
  </BModal>
</template>
