<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { examSchema, TERM_RANGE, termOf } from '~/schemas/exam';
import { examsApi } from '~/services/examsApi';
import type { Examination, ExaminationInput, ExamKind } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';

// Add an examination to the chosen academic year (`exam` null) or edit one. The year never changes after creation.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ exam: Examination | null; yearId: number | null; yearName: string }>();
const emit = defineEmits<{ saved: [exam: Examination]; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();
const { examKindOptions } = useLabels();

const blank = () => ({ nameKm: '', kind: 'MONTHLY', termNo: '', startDate: '', endDate: '' });
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(examSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['nameKm', 'kind', 'termNo', 'startDate', 'endDate'], setErrors });

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const e = props.exam;
  resetForm({
    values: e ? { nameKm: e.nameKm, kind: e.kind, termNo: e.termNo === null ? '' : String(e.termNo), startDate: e.startDate ?? '', endDate: e.endDate ?? '' } : blank(),
  });
});

const onSubmit = handleSubmit(async (form) => {
  const target = props.exam;
  const input: ExaminationInput = {
    nameKm: form.nameKm,
    kind: form.kind as ExamKind,
    termNo: termOf(form.termNo),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
  };
  const saved = await submit.run(() => (target ? examsApi.update(target.id, input, target.version) : examsApi.create(props.yearId as number, input)));
  if (!saved) {
    const code = submit.lastError.value?.code;
    if (code === 'OPTIMISTIC_LOCK' || code === 'ACADEMIC_YEAR_CLOSED') {
      notify.warning(t('exams.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'exams.saved' : 'exams.created'));
  open.value = false;
  emit('saved', saved);
});

const digits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });
</script>

<template>
  <BModal v-model="open" :title="t(exam ? 'exams.editTitle' : 'exams.addTitle')" size="lg" centered no-close-on-backdrop>
    <form id="exam-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <p class="text-muted">{{ t('classes.forYear', { year: yearName }) }}</p>
      <div class="row">
        <div class="col-md-8"><FormInput name="nameKm" :label="t('exams.name')" required :maxlength="100" :hint="t('exams.nameHint')" autofocus /></div>
        <div class="col-md-4"><FormSelect name="kind" :label="t('exams.kindLabel')" required :options="examKindOptions" /></div>
      </div>
      <div class="row">
        <div class="col-md-4">
          <FormInput name="termNo" :label="t('exams.term')" inputmode="numeric" :maxlength="2" :formatter="digits" :hint="t('exams.termHint', TERM_RANGE)" />
        </div>
        <div class="col-md-4"><FormInput name="startDate" type="date" :label="t('exams.startDate')" /></div>
        <div class="col-md-4"><FormInput name="endDate" type="date" :label="t('exams.endDate')" /></div>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="exam-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
