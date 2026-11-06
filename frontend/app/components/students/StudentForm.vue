<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { type GuardianRowProblem, type GuardianRowValues, guardianProblems, studentSchema, type StudentValues } from '~/schemas/student';
import { studentsApi } from '~/services/studentsApi';
import type { ClassDto, Gender, Relationship, StudentDetail, StudentInput } from '~/types/api';
import { khmerDigitsToAscii } from '~/utils/khmer';

// Register a student (`detail` null) or edit one. When registering, a class of the current year can be chosen: the student is
// enrolled in the same step. Same Khmer name + date of birth as somebody else = a warning the user confirms, never a block.
const props = defineProps<{
  detail: StudentDetail | null;
  /** Classes the new student can be put in (the current academic year); only used when registering. */
  classes?: ClassDto[];
}>();
const emit = defineEmits<{ saved: [detail: StudentDetail]; cancel: []; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();
const { genderOptions } = useLabels();

const editing = computed(() => props.detail !== null);
const classOptions = computed(() => (props.classes ?? []).map((c) => ({ value: c.id, label: `${c.gradeName} ${c.nameKm} (${c.studentCount}/${c.capacity})` })));

function initial(): StudentValues {
  const s = props.detail?.student;
  return {
    nameKm: s?.nameKm ?? '',
    nameEn: s?.nameEn ?? '',
    gender: s?.gender ?? '',
    dateOfBirth: s?.dateOfBirth ?? '',
    enrollmentDate: s?.enrollmentDate ?? '',
    placeOfBirth: s?.placeOfBirth ?? '',
    address: s?.address ?? '',
    village: s?.village ?? '',
    commune: s?.commune ?? '',
    district: s?.district ?? '',
    province: s?.province ?? '',
    notes: s?.notes ?? '',
    classId: '',
  };
}

const { handleSubmit, setErrors } = useForm({ validationSchema: toTypedSchema(studentSchema), initialValues: initial() });
const submit = useSubmit({
  fields: ['nameKm', 'nameEn', 'gender', 'dateOfBirth', 'enrollmentDate', 'placeOfBirth', 'address', 'village', 'commune', 'district', 'province', 'notes', 'classId'],
  setErrors,
});

const guardians = ref<GuardianRowValues[]>(
  (props.detail?.guardians ?? []).map((g) => ({ nameKm: g.nameKm, relationship: g.relationship, phone: g.phone ?? '', primary: g.primary })),
);
const problems = ref<Record<number, GuardianRowProblem>>({});
const pending = ref<StudentValues | null>(null);
const duplicateCode = ref('');
const confirmOpen = computed({
  get: () => pending.value !== null,
  set: (open: boolean) => {
    if (!open) pending.value = null;
  },
});

async function persist(form: StudentValues, allowDuplicate: boolean): Promise<void> {
  const input: StudentInput = {
    nameKm: form.nameKm,
    nameEn: form.nameEn,
    gender: form.gender as Gender,
    dateOfBirth: form.dateOfBirth,
    placeOfBirth: form.placeOfBirth,
    address: form.address,
    village: form.village,
    commune: form.commune,
    district: form.district,
    province: form.province,
    enrollmentDate: form.enrollmentDate || null,
    notes: form.notes,
    guardians: guardians.value.map((g) => ({ nameKm: g.nameKm, relationship: g.relationship as Relationship, phone: khmerDigitsToAscii(g.phone), primary: g.primary })),
    allowDuplicate,
  };
  const target = props.detail?.student;
  const saved = await submit.run(() => (target ? studentsApi.update(target.id, input, target.version) : studentsApi.create(input, form.classId ? Number(form.classId) : null)));
  if (!saved) {
    const error = submit.lastError.value;
    if (error?.code === 'POSSIBLE_DUPLICATE') {
      duplicateCode.value = String(error.extra.studentCode ?? '');
      pending.value = form;
      submit.clearError();
    } else if (error?.code === 'OPTIMISTIC_LOCK') {
      notify.warning(t('students.reloaded'));
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'students.saved' : 'students.created'));
  if (saved.warnings.includes('CLASS_OVER_CAPACITY')) notify.warning(t('classes.overCapacity'));
  pending.value = null;
  emit('saved', saved);
}

const onSubmit = handleSubmit(async (form) => {
  problems.value = guardianProblems(guardians.value);
  if (Object.keys(problems.value).length > 0) return;
  await persist(form, false);
});

async function saveAnyway(): Promise<void> {
  const form = pending.value;
  pending.value = null;
  if (form) await persist(form, true);
}
</script>

<template>
  <form novalidate @submit.prevent="onSubmit">
    <FormAlert :message="submit.formError.value" />

    <h2 class="h6 form-section">{{ t('students.sectionPerson') }}</h2>
    <div class="row">
      <div class="col-md-6"><FormInput name="nameKm" :label="t('students.nameKm')" required :maxlength="100" autofocus /></div>
      <div class="col-md-6"><FormInput name="nameEn" :label="t('students.nameEn')" :maxlength="100" /></div>
    </div>
    <div class="row">
      <div class="col-md-4"><FormSelect name="gender" :label="t('common.gender')" required :placeholder="t('common.choose')" :options="genderOptions" /></div>
      <div class="col-md-4"><FormInput name="dateOfBirth" type="date" :label="t('students.dateOfBirth')" required /></div>
      <div class="col-md-4"><FormInput name="placeOfBirth" :label="t('students.placeOfBirth')" :maxlength="200" /></div>
    </div>

    <h2 class="h6 form-section">{{ t('students.sectionAddress') }}</h2>
    <FormInput name="address" :label="t('common.address')" :maxlength="500" />
    <div class="row">
      <div class="col-md-3"><FormInput name="village" :label="t('students.village')" :maxlength="100" /></div>
      <div class="col-md-3"><FormInput name="commune" :label="t('students.commune')" :maxlength="100" /></div>
      <div class="col-md-3"><FormInput name="district" :label="t('students.district')" :maxlength="100" /></div>
      <div class="col-md-3"><FormInput name="province" :label="t('students.province')" :maxlength="100" /></div>
    </div>

    <h2 class="h6 form-section">{{ t('students.sectionSchool') }}</h2>
    <div class="row">
      <div class="col-md-4"><FormInput name="enrollmentDate" type="date" :label="t('students.enrollmentDate')" :hint="t('students.enrollmentDateHint')" /></div>
      <div v-if="!editing" class="col-md-8">
        <FormSelect name="classId" :label="t('students.enrollInClass')" :placeholder="t('students.notEnrolledYet')" :options="classOptions" :hint="t('students.enrollInClassHint')" />
      </div>
    </div>

    <h2 class="h6 form-section">{{ t('students.sectionGuardians') }}</h2>
    <GuardianRows v-model="guardians" :problems="problems" />

    <h2 class="h6 form-section mt-4">{{ t('students.sectionNotes') }}</h2>
    <FormInput name="notes" type="textarea" :rows="3" :label="t('common.notes')" :maxlength="2000" />

    <div class="d-flex gap-2 mt-3">
      <LoadingButton type="submit" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
      <button type="button" class="btn btn-outline-secondary" @click="emit('cancel')">{{ t('common.cancel') }}</button>
    </div>

    <ConfirmModal
      v-model="confirmOpen"
      variant="primary"
      :title="t('students.duplicateTitle')"
      :message="t('students.duplicateMessage', { code: duplicateCode })"
      :confirm-label="t('students.saveAnyway')"
      @confirm="saveAnyway"
    />
  </form>
</template>
