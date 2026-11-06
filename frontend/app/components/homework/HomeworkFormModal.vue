<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useField, useForm } from 'vee-validate';
import { homeworkSchema } from '~/schemas/homework';
import { homeworkApi } from '~/services/homeworkApi';
import type { ClassDto, Homework, HomeworkInput, Subject } from '~/types/api';
import { todayIso } from '~/utils/date';
import { homeworkSubjectOptions } from '~/utils/homework';
import { formatNumber, parseDecimal } from '~/utils/score';

// Record homework (`homework` null) or edit it: which class and which subject (a main subject or one of its sub-subjects), what was given, when it was given and when
// it is due. It can also have marks: "has a score" asks for a maximum, and the students' marks are then entered from the homework list. Without it the homework is a record
// only. Homework marks are never part of an examination.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  homework: Homework | null;
  /** The classes the homework may be for (the open academic year's). */
  classes: ClassDto[];
  subjects: Subject[];
  /** Pre-selected class for a new record. */
  defaultClassId: number | null;
}>();
const emit = defineEmits<{ saved: [homework: Homework]; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

const blank = () => ({
  classId: props.defaultClassId === null ? '' : String(props.defaultClassId),
  subjectId: '',
  title: '',
  description: '',
  assignedDate: todayIso(),
  dueDate: todayIso(),
  remark: '',
  scored: false,
  maxScore: '',
});
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(homeworkSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['classId', 'subjectId', 'title', 'description', 'assignedDate', 'dueDate', 'remark', 'maxScore'], setErrors });
const { value: scored } = useField<boolean>('scored');

const classOptions = computed(() => props.classes.map((c) => ({ value: c.id, label: `${c.gradeName} ${c.nameKm}` })));
const subjectOptions = computed(() => homeworkSubjectOptions(props.subjects, props.homework?.subjectId ?? null).map((o) => ({ value: o.value, label: o.label })));

/** Marks already entered: the scoring cannot be switched off (cancel the homework instead) and the maximum cannot go below a mark. */
const hasMarks = computed(() => (props.homework?.markedCount ?? 0) > 0);
/** Students already have a status or a mark for it: it stays with its class. */
const hasRecords = computed(() => {
  const h = props.homework;
  return h !== null && h.submittedCount + h.lateCount + h.notSubmittedCount + h.excusedCount + h.markedCount > 0;
});

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const h = props.homework;
  resetForm({
    values: h
      ? {
          classId: String(h.classId),
          subjectId: String(h.subjectId),
          title: h.title,
          description: h.description ?? '',
          assignedDate: h.assignedDate,
          dueDate: h.dueDate,
          remark: h.remark ?? '',
          scored: h.maxScore !== null,
          maxScore: h.maxScore === null ? '' : formatNumber(h.maxScore),
        }
      : blank(),
  });
});

const onSubmit = handleSubmit(async (form) => {
  const target = props.homework;
  const input: HomeworkInput = {
    classId: Number(form.classId),
    subjectId: Number(form.subjectId),
    title: form.title,
    description: form.description || null,
    assignedDate: form.assignedDate,
    dueDate: form.dueDate,
    remark: form.remark || null,
    maxScore: form.scored ? parseDecimal(form.maxScore ?? '') : null,
  };
  const saved = await submit.run(() => (target ? homeworkApi.update(target.id, input, target.version) : homeworkApi.create(input)));
  if (!saved) {
    const code = submit.lastError.value?.code;
    if (code === 'OPTIMISTIC_LOCK' || code === 'ACADEMIC_YEAR_CLOSED') {
      notify.warning(t('homework.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'homework.saved' : 'homework.created'));
  open.value = false;
  emit('saved', saved);
});
</script>

<template>
  <BModal v-model="open" :title="t(homework ? 'homework.editTitle' : 'homework.addTitle')" size="lg" centered no-close-on-backdrop scrollable>
    <form id="homework-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <div class="row">
        <div class="col-md-6"><FormSelect name="classId" :label="t('classes.title')" required :placeholder="t('common.choose')" :options="classOptions" :disabled="hasRecords" :hint="hasRecords ? t('homework.classLocked') : undefined" /></div>
        <div class="col-md-6"><FormSelect name="subjectId" :label="t('exams.subject')" required :placeholder="t('common.choose')" :options="subjectOptions" /></div>
      </div>
      <FormInput name="title" :label="t('homework.titleLabel')" required :maxlength="200" autofocus />
      <FormInput name="description" type="textarea" :label="t('homework.description')" :maxlength="2000" :rows="3" />
      <div class="row">
        <div class="col-md-6"><FormInput name="assignedDate" type="date" :label="t('homework.assignedDate')" required /></div>
        <div class="col-md-6"><FormInput name="dueDate" type="date" :label="t('homework.dueDate')" required /></div>
      </div>
      <div class="form-check form-switch mb-2">
        <input id="homework-scored" v-model="scored" type="checkbox" role="switch" class="form-check-input" :disabled="hasMarks" data-testid="homework-scored" />
        <label for="homework-scored" class="form-check-label">{{ t('homework.hasScore') }}</label>
        <div class="form-text">{{ hasMarks ? t('homework.hasScoreLocked') : t('homework.hasScoreHint') }}</div>
      </div>
      <FormInput v-if="scored" name="maxScore" :label="t('homework.maxScore')" required inputmode="decimal" :maxlength="9" :hint="t('homework.maxScoreHint')" />
      <FormInput name="remark" :label="t('homework.remark')" :maxlength="500" />
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="homework-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
