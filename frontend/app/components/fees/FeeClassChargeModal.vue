<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { amountProblem, feeChargeSchema } from '~/schemas/fees';
import { feesApi } from '~/services/feesApi';
import type { FeeCategory } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';
import { formatMoney, parseMoney } from '~/utils/money';
import { sortByKhmer } from '~/utils/sort';

// Charge every student who is in the class now with the same fee. A student who already has that category with that due date is
// skipped, so pressing the button twice cannot charge anybody twice.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ classId: number; className: string; categories: FeeCategory[] }>();
const emit = defineEmits<{ saved: []; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

const blank = () => ({ categoryId: '', amount: '', dueDate: '', note: '' });
const { handleSubmit, setErrors, resetForm, values } = useForm({ validationSchema: toTypedSchema(feeChargeSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['categoryId', 'amount', 'dueDate', 'note'], setErrors });

const options = computed(() => sortByKhmer(props.categories.filter((c) => c.active), (c) => c.nameKm).map((c) => ({ value: c.id, label: `${c.nameKm} (${c.defaultAmount > 0 ? formatMoney(c.defaultAmount, c.currency) : t('fees.askEachTime')})` })));
const chosen = computed(() => props.categories.find((c) => String(c.id) === values.categoryId) ?? null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  resetForm({ values: blank() });
});

const onSubmit = handleSubmit(async (form) => {
  const currency = chosen.value?.currency ?? 'KHR';
  const problem = amountProblem(form.amount, currency);
  if (problem) {
    setErrors({ amount: problem });
    return;
  }
  const input = { categoryId: Number(form.categoryId), amount: form.amount.trim() === '' ? null : parseMoney(form.amount, currency), dueDate: form.dueDate || null, note: form.note || null };
  const result = await submit.run(() => feesApi.chargeClass(props.classId, input));
  if (!result) {
    if (submit.lastError.value?.code === 'ACADEMIC_YEAR_CLOSED') {
      notify.warning(t('fees.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t('fees.classCharged', { created: result.created, skipped: result.skipped }));
  open.value = false;
  emit('saved');
});

const digits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });
</script>

<template>
  <BModal v-model="open" :title="t('fees.classChargeTitle', { name: className })" centered no-close-on-backdrop>
    <form id="fee-class-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <p class="text-muted">{{ t('fees.classChargeHelp') }}</p>
      <FormSelect name="categoryId" :label="t('fees.category')" required :placeholder="t('common.choose')" :options="options" />
      <div class="row">
        <div class="col-md-6"><FormInput name="amount" :label="t('fees.amount')" inputmode="decimal" :maxlength="16" :formatter="digits" :hint="t('fees.amountHint')" /></div>
        <div class="col-md-6"><FormInput name="dueDate" type="date" :label="t('fees.dueDate')" /></div>
      </div>
      <FormInput name="note" :label="t('fees.note')" :maxlength="200" />
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="fee-class-form" icon="check-lg" :loading="submit.submitting.value">{{ t('fees.chargeClass') }}</LoadingButton>
    </template>
  </BModal>
</template>
