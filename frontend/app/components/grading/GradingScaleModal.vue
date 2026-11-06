<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { type BandRowValues, bandProblems, gradingScaleSchema, LABEL_MAX, LETTER_MAX, MAX_BANDS } from '~/schemas/grading';
import { gradingApi } from '~/services/gradingApi';
import type { GradingScale } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';
import { formatNumber, parseDecimal } from '~/utils/score';

// Add a grading scale (`scale` null; it starts as a copy of `template`) or edit one: a name, the pass mark, and the bands
// (from which percentage, the Khmer label, the letter). Every score must fall into a band, so one band starts at 0.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ scale: GradingScale | null; template: GradingScale | null }>();
const emit = defineEmits<{ saved: [scale: GradingScale]; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();
const { validationText } = useApiError();

const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(gradingScaleSchema), initialValues: { nameKm: '', passPercent: '50' } });
const submit = useSubmit({ fields: ['nameKm', 'passPercent'], setErrors });

const bands = ref<BandRowValues[]>([]);
const showBandProblems = ref(false);
const problems = computed(() => bandProblems(bands.value));

const rowsFrom = (source: GradingScale | null): BandRowValues[] =>
  (source?.bands ?? [{ minPercent: 0, labelKm: '', letter: '' }]).map((b) => ({ minPercent: formatNumber(b.minPercent), labelKm: b.labelKm, letter: b.letter }));

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  showBandProblems.value = false;
  const source = props.scale ?? props.template;
  resetForm({ values: { nameKm: props.scale?.nameKm ?? '', passPercent: formatNumber(source?.passPercent ?? 50) } });
  bands.value = rowsFrom(source);
});

function addBand(): void {
  if (bands.value.length < MAX_BANDS) bands.value = [...bands.value, { minPercent: '', labelKm: '', letter: '' }];
}

function removeBand(index: number): void {
  bands.value = bands.value.filter((_, i) => i !== index);
}

const onSubmit = handleSubmit(
  async (form) => {
    showBandProblems.value = true;
    if (!problems.value.ok) return;
    const target = props.scale;
    const input = {
      nameKm: form.nameKm,
      passPercent: parseDecimal(form.passPercent),
      bands: bands.value.map((b) => ({ minPercent: parseDecimal(b.minPercent), labelKm: b.labelKm.trim(), letter: b.letter.trim() })),
    };
    const saved = await submit.run(() => (target ? gradingApi.update(target.id, input, target.version) : gradingApi.create(input)));
    if (!saved) {
      if (submit.lastError.value?.code === 'OPTIMISTIC_LOCK') {
        notify.warning(t('grading.reloaded'));
        open.value = false;
        emit('stale');
      }
      return;
    }
    notify.success(t(target ? 'grading.saved' : 'grading.created'));
    open.value = false;
    emit('saved', saved);
  },
  () => {
    showBandProblems.value = true;
  },
);

const digits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });
const rowProblem = (index: number, field: 'minPercent' | 'labelKm' | 'letter'): string | undefined => (showBandProblems.value ? problems.value.rows[index]?.[field] : undefined);
</script>

<template>
  <BModal v-model="open" :title="t(scale ? 'grading.editTitle' : 'grading.addTitle')" size="lg" centered no-close-on-backdrop scrollable>
    <form id="grading-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <div class="row">
        <div class="col-md-8"><FormInput name="nameKm" :label="t('grading.name')" required :maxlength="100" autofocus /></div>
        <div class="col-md-4">
          <FormInput name="passPercent" :label="t('grading.passMark')" required inputmode="decimal" :maxlength="6" :formatter="digits" :hint="t('grading.passMarkHint')" />
        </div>
      </div>

      <h2 class="h6 form-section">{{ t('grading.bands') }}</h2>
      <p class="text-muted">{{ t('grading.bandsHelp') }}</p>
      <div v-for="(band, index) in bands" :key="index" class="guardian-row">
        <div class="row g-2">
          <div class="col-md-3">
            <label :for="`band-min-${index}`" class="form-label">{{ t('grading.fromPercent') }}<span class="text-danger" aria-hidden="true"> *</span></label>
            <input :id="`band-min-${index}`" v-model="band.minPercent" class="form-control" :class="{ 'is-invalid': rowProblem(index, 'minPercent') }" inputmode="decimal" maxlength="6" autocomplete="off" />
            <div v-if="rowProblem(index, 'minPercent')" class="field-error mt-1" role="alert">{{ validationText(rowProblem(index, 'minPercent')) }}</div>
          </div>
          <div class="col-md-5">
            <label :for="`band-label-${index}`" class="form-label">{{ t('grading.label') }}<span class="text-danger" aria-hidden="true"> *</span></label>
            <input :id="`band-label-${index}`" v-model="band.labelKm" class="form-control" :class="{ 'is-invalid': rowProblem(index, 'labelKm') }" :maxlength="LABEL_MAX" autocomplete="off" />
            <div v-if="rowProblem(index, 'labelKm')" class="field-error mt-1" role="alert">{{ validationText(rowProblem(index, 'labelKm')) }}</div>
          </div>
          <div class="col-md-2">
            <label :for="`band-letter-${index}`" class="form-label">{{ t('grading.letter') }}<span class="text-danger" aria-hidden="true"> *</span></label>
            <input :id="`band-letter-${index}`" v-model="band.letter" class="form-control" :class="{ 'is-invalid': rowProblem(index, 'letter') }" :maxlength="LETTER_MAX" autocomplete="off" />
            <div v-if="rowProblem(index, 'letter')" class="field-error mt-1" role="alert">{{ validationText(rowProblem(index, 'letter')) }}</div>
          </div>
          <div class="col-md-2 d-flex align-items-end pb-1">
            <button type="button" class="btn btn-outline-danger btn-sm" :disabled="bands.length <= 1" :aria-label="t('grading.removeBand')" :title="t('grading.removeBand')" @click="removeBand(index)">
              <AppIcon name="trash" />
            </button>
          </div>
        </div>
      </div>
      <div v-if="showBandProblems && problems.general" class="field-error mb-2" role="alert">{{ validationText(problems.general) }}</div>
      <button v-if="bands.length < MAX_BANDS" type="button" class="btn btn-outline-primary btn-sm" @click="addBand"><AppIcon name="plus-lg" />{{ t('grading.addBand') }}</button>
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="grading-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
