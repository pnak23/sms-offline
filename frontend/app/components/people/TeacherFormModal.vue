<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { teacherSchema } from '~/schemas/teacher';
import { teachersApi } from '~/services/teachersApi';
import type { Gender, Teacher, TeacherInput } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';

// Add a teacher (`teacher` null) or edit one. Emits `saved` with the stored teacher, or `stale` when somebody else changed it first.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ teacher: Teacher | null }>();
const emit = defineEmits<{ saved: [teacher: Teacher]; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();
const { genderOptions } = useLabels();

const blank = () => ({ nameKm: '', gender: '', phone: '', specialization: '', address: '', employmentDate: '' });
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(teacherSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['nameKm', 'gender', 'phone', 'specialization', 'address', 'employmentDate'], setErrors });

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const t0 = props.teacher;
  resetForm({
    values: t0
      ? { nameKm: t0.nameKm, gender: t0.gender, phone: t0.phone ?? '', specialization: t0.specialization ?? '', address: t0.address ?? '', employmentDate: t0.employmentDate ?? '' }
      : blank(),
  });
});

const onSubmit = handleSubmit(async (form) => {
  const input: TeacherInput = {
    nameKm: form.nameKm,
    gender: form.gender as Gender,
    phone: khmerDigitsToAscii(form.phone),
    address: form.address,
    specialization: form.specialization,
    employmentDate: form.employmentDate || null,
  };
  const target = props.teacher;
  const saved = await submit.run(() => (target ? teachersApi.update(target.id, input, target.version) : teachersApi.create(input)));
  if (!saved) {
    if (submit.lastError.value?.code === 'OPTIMISTIC_LOCK') {
      notify.warning(t('teachers.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'teachers.saved' : 'teachers.created'));
  open.value = false;
  emit('saved', saved);
});
</script>

<template>
  <BModal v-model="open" :title="t(teacher ? 'teachers.editTitle' : 'teachers.addTitle')" size="lg" centered no-close-on-backdrop>
    <form id="teacher-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <div class="row">
        <div class="col-md-8"><FormInput name="nameKm" :label="t('teachers.nameKm')" required :maxlength="100" autofocus /></div>
        <div class="col-md-4"><FormSelect name="gender" :label="t('common.gender')" required :placeholder="t('common.choose')" :options="genderOptions" /></div>
      </div>
      <div class="row">
        <div class="col-md-6"><FormInput name="phone" :label="t('common.phone')" inputmode="tel" :maxlength="50" /></div>
        <div class="col-md-6"><FormInput name="employmentDate" type="date" :label="t('teachers.employmentDate')" /></div>
      </div>
      <FormInput name="specialization" :label="t('teachers.specialization')" :maxlength="150" />
      <FormInput name="address" type="textarea" :rows="2" :label="t('common.address')" :maxlength="500" />
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="teacher-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
