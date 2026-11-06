<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { currencyOf, feeCategorySchema } from '~/schemas/fees';
import { feesApi } from '~/services/feesApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { FeeCategory } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';
import { parseDefaultAmount } from '~/utils/money';

// Add a fee category (what the school charges: monthly fee, books ...) or edit one. An empty default amount means "ask each time".
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ category: FeeCategory | null }>();
const emit = defineEmits<{ saved: []; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();
const preferences = usePreferencesStore();

const blank = () => ({ nameKm: '', currency: preferences.feeCurrencies[0] ?? 'KHR', defaultAmount: '' });
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(feeCategorySchema), initialValues: blank() });
const submit = useSubmit({ fields: ['nameKm', 'currency', 'defaultAmount'], setErrors });

const currencyOptions = computed(() => preferences.feeCurrencies.map((c) => ({ value: c, label: t(`fees.currency.${c}`) })));

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const c = props.category;
  resetForm({ values: c ? { nameKm: c.nameKm, currency: c.currency, defaultAmount: c.defaultAmount > 0 ? String(c.defaultAmount) : '' } : blank() });
});

const onSubmit = handleSubmit(async (form) => {
  const target = props.category;
  const currency = currencyOf(form.currency);
  const input = { nameKm: form.nameKm, currency, defaultAmount: parseDefaultAmount(form.defaultAmount, currency) };
  const saved = await submit.run(() => (target ? feesApi.updateCategory(target.id, input, target.version) : feesApi.createCategory(input)));
  if (!saved) {
    if (submit.lastError.value?.code === 'OPTIMISTIC_LOCK') {
      notify.warning(t('fees.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'fees.categorySaved' : 'fees.categoryCreated'));
  open.value = false;
  emit('saved');
});

const digits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });
</script>

<template>
  <BModal v-model="open" :title="t(category ? 'fees.editCategoryTitle' : 'fees.addCategoryTitle')" centered no-close-on-backdrop>
    <form id="fee-category-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <FormInput name="nameKm" :label="t('fees.categoryName')" required :maxlength="100" :hint="t('fees.categoryNameHint')" autofocus />
      <div class="row">
        <div class="col-md-6"><FormSelect name="currency" :label="t('fees.currencyLabel')" required :options="currencyOptions" /></div>
        <div class="col-md-6"><FormInput name="defaultAmount" :label="t('fees.defaultAmount')" inputmode="decimal" :maxlength="16" :formatter="digits" :hint="t('fees.defaultAmountHint')" /></div>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="fee-category-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
