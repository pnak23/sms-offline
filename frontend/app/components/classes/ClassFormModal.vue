<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { CAPACITY_RANGE, capacityOf, classSchema, DEFAULT_CAPACITY } from '~/schemas/schoolClass';
import { classesApi } from '~/services/classesApi';
import type { ClassDetail, ClassDto, Grade, Teacher } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';
import { sortByKhmer } from '~/utils/sort';

// Add a class to the chosen academic year (`schoolClass` null) or edit one. The year and the grade never change after creation.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  schoolClass: ClassDto | null;
  yearId: number | null;
  yearName: string;
  grades: Grade[];
  /** Active teachers; the class's current homeroom teacher is added even if inactive so the select still shows them. */
  teachers: Teacher[];
}>();
const emit = defineEmits<{ saved: [detail: ClassDetail]; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

const blank = () => ({ gradeId: '', nameKm: '', capacity: '', homeroomTeacherId: '' });
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(classSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['gradeId', 'nameKm', 'capacity', 'homeroomTeacherId'], setErrors });

const gradeOptions = computed(() => props.grades.map((g) => ({ value: g.id, label: g.nameKm })));
const teacherOptions = computed(() => {
  const current = props.schoolClass?.homeroomTeacherId;
  return sortByKhmer(
    props.teachers.filter((teacher) => teacher.status === 'ACTIVE' || teacher.id === current),
    (teacher) => teacher.nameKm,
  ).map((teacher) => ({ value: teacher.id, label: teacher.nameKm }));
});

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const c = props.schoolClass;
  resetForm({
    values: c
      ? { gradeId: String(c.gradeId), nameKm: c.nameKm, capacity: String(c.capacity), homeroomTeacherId: c.homeroomTeacherId ? String(c.homeroomTeacherId) : '' }
      : blank(),
  });
});

const onSubmit = handleSubmit(async (form) => {
  const target = props.schoolClass;
  const homeroomTeacherId = form.homeroomTeacherId ? Number(form.homeroomTeacherId) : null;
  const capacity = capacityOf(form.capacity);
  const saved = await submit.run(() =>
    target
      ? classesApi.update(target.id, { nameKm: form.nameKm, capacity, homeroomTeacherId }, target.version)
      : classesApi.create({ academicYearId: props.yearId as number, gradeId: Number(form.gradeId), nameKm: form.nameKm, capacity, homeroomTeacherId }),
  );
  if (!saved) {
    const code = submit.lastError.value?.code;
    if (code === 'OPTIMISTIC_LOCK' || code === 'ACADEMIC_YEAR_CLOSED') {
      notify.warning(t('classes.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'classes.saved' : 'classes.created'));
  open.value = false;
  emit('saved', saved);
});

const digits = (text: string, caret: number) => ({ value: khmerDigitsToAscii(text), caret });
</script>

<template>
  <BModal v-model="open" :title="t(schoolClass ? 'classes.editTitle' : 'classes.addTitle')" size="lg" centered no-close-on-backdrop>
    <form id="class-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <p class="text-muted">{{ t('classes.forYear', { year: yearName }) }}</p>
      <div class="row">
        <div class="col-md-6">
          <FormSelect name="gradeId" :label="t('classes.grade')" required :placeholder="t('common.choose')" :options="gradeOptions" :disabled="!!schoolClass" />
        </div>
        <div class="col-md-6"><FormInput name="nameKm" :label="t('classes.name')" required :maxlength="50" :hint="t('classes.nameHint')" autofocus /></div>
      </div>
      <div class="row">
        <div class="col-md-6">
          <FormInput
            name="capacity"
            :label="t('classes.capacity')"
            inputmode="numeric"
            :maxlength="3"
            :formatter="digits"
            :placeholder="String(DEFAULT_CAPACITY)"
            :hint="t('classes.capacityHint', CAPACITY_RANGE)"
          />
        </div>
        <div class="col-md-6">
          <FormSelect name="homeroomTeacherId" :label="t('classes.homeroomTeacher')" :placeholder="t('classes.noHomeroom')" :options="teacherOptions" />
        </div>
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="class-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
