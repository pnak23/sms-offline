<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { amountProblem, feeChargeSchema } from '~/schemas/fees';
import { feesApi } from '~/services/feesApi';
import type { FeeCategory, FeeCharge } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';
import { formatMoney, parseMoney } from '~/utils/money';
import { sortByKhmer } from '~/utils/sort';

// Charge one student a fee (`charge` null), or change a charge: its amount, due date and note. An empty amount uses the category's own.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ enrollmentId: number; charge: FeeCharge | null; categories: FeeCategory[] }>();
const emit = defineEmits<{ saved: []; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

const blank = () => ({ categoryId: '', amount: '', dueDate: '', note: '' });
const { handleSubmit, setErrors, resetForm, values } = useForm({ validationSchema: toTypedSchema(feeChargeSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['categoryId', 'amount', 'dueDate', 'note'], setErrors });

const options = computed(() => sortByKhmer(props.categories.filter((c) => c.active), (c) => c.nameKm).map((c) => ({ value: c.id, label: `${c.nameKm} (${c.defaultAmount > 0 ? formatMoney(c.defaultAmount, c.currency) : t('fees.askEachTime')})` })));
const chosen = computed(() => props.categories.find((c) => String(c.id) === values.categoryId) ?? null);
const currency = computed(() => props.charge?.currency ?? chosen.value?.currency ?? 'KHR');

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const c = props.charge;
  resetForm({ values: c ? { categoryId: String(c.categoryId), amount: String(c.amountDue), dueDate: c.dueDate ?? '', note: c.note ?? '' } : blank() });
});

const onSubmit = handleSubmit(async (form) => {
  const target = props.charge;
  const problem = amountProblem(form.amount, currency.value);
  if (problem || (target && form.amount.trim() === '')) {
    setErrors({ amount: problem ?? 'REQUIRED' });
    return;
  }
  const amount = form.amount.trim() === '' ? null : parseMoney(form.amount, currency.value);
  const input = { categoryId: Number(form.categoryId), amount, dueDate: form.dueDate || null, note: form.note || null };
  const saved = await submit.run(() => (target ? feesApi.updateCharge(target.id, { amount: amount as number, dueDate: input.dueDate, note: input.note }, target.version) : feesApi.charge(props.enrollmentId, input)));
  if (!saved) {
    const code = submit.lastError.value?.code;
    if (code === 'OPTIMISTIC_LOCK' || code === 'ACADEMIC_YEAR_CLOSED' || code === 'NOT_FOUND') {
      notify.warning(t('fees.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'fees.chargeSaved' : 'fees.charged'));
  open.value = false;
  emit('saved');
});

const digits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });
</script>

<template>
  <BModal v-model="open" :title="t(charge ? 'fees.editChargeTitle' : 'fees.addChargeTitle')" centered no-close-on-backdrop>
    <form id="fee-charge-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <FormSelect name="categoryId" :label="t('fees.category')" required :placeholder="t('common.choose')" :options="options" :disabled="!!charge" />
      <div class="row">
        <div class="col-md-6">
          <FormInput name="amount" :label="t('fees.amount')" inputmode="decimal" :maxlength="16" :formatter="digits" :hint="charge ? undefined : t('fees.amountHint')" :required="!!charge" />
        </div>
        <div class="col-md-6"><FormInput name="dueDate" type="date" :label="t('fees.dueDate')" /></div>
      </div>
      <FormInput name="note" :label="t('fees.note')" :maxlength="200" />
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="fee-charge-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
