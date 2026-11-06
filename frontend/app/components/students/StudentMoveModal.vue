<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { enrollmentsApi } from '~/services/enrollmentsApi';
import type { ClassDto } from '~/types/api';
import { toIsoDate } from '~/utils/date';

// Three small questions about one student, one dialog:
//  enroll   - put a student who has no class this year into a class
//  transfer - move to another class of the same year (the old enrollment is kept, closed as "changed class")
//  leave    - the student leaves the school (the enrollment ends; the student becomes inactive; history stays)
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  mode: 'enroll' | 'transfer' | 'leave';
  studentId: number;
  /** The student's active enrollment (transfer and leave). */
  enrollmentId: number | null;
  /** Classes that can be chosen (enroll and transfer); the page already left out the current class. */
  classes: ClassDto[];
}>();
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();
const { messageFor, validationText } = useApiError();
const notify = useNotify();

const classId = ref('');
const date = ref('');
const reason = ref('');
const saving = ref(false);
const error = ref<string | null>(null);
const classError = ref('');
const dateError = ref('');

const needsClass = computed(() => props.mode !== 'leave');
const needsReason = computed(() => props.mode !== 'enroll');
const options = computed(() => props.classes.map((c) => ({ value: c.id, label: `${c.gradeName} ${c.nameKm} (${c.studentCount}/${c.capacity})` })));

watch(open, (isOpen) => {
  if (!isOpen) return;
  classId.value = '';
  date.value = '';
  reason.value = '';
  error.value = null;
  classError.value = '';
  dateError.value = '';
});

async function save(): Promise<void> {
  classError.value = needsClass.value && !classId.value ? 'REQUIRED' : '';
  dateError.value = date.value && !toIsoDate(date.value) ? 'INVALID_DATE' : '';
  if (classError.value || dateError.value) return;
  saving.value = true;
  error.value = null;
  try {
    const when = date.value || null;
    if (props.mode === 'enroll') {
      const result = await enrollmentsApi.enroll(props.studentId, Number(classId.value), when);
      if (result.warnings.includes('CLASS_OVER_CAPACITY')) notify.warning(t('classes.overCapacity'));
    } else if (props.mode === 'transfer') {
      const result = await enrollmentsApi.transfer(props.enrollmentId as number, Number(classId.value), when, reason.value);
      if (result.warnings.includes('CLASS_OVER_CAPACITY')) notify.warning(t('classes.overCapacity'));
    } else {
      await enrollmentsApi.leave(props.enrollmentId as number, when, reason.value);
    }
    notify.success(t(`students.move.${props.mode}Done`));
    open.value = false;
    emit('done');
  } catch (e) {
    error.value = messageFor(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BModal v-model="open" :title="t(`students.move.${mode}Title`)" centered no-close-on-backdrop>
    <form id="move-form" novalidate @submit.prevent="save">
      <FormAlert :message="error" />
      <p class="text-muted">{{ t(`students.move.${mode}Intro`) }}</p>
      <div v-if="needsClass" class="mb-3">
        <label for="move-class" class="form-label">{{ t('students.move.class') }}<span class="text-danger" aria-hidden="true"> *</span></label>
        <select id="move-class" v-model="classId" class="form-select" :class="{ 'is-invalid': classError }">
          <option value="">{{ t('common.choose') }}</option>
          <option v-for="o in options" :key="o.value" :value="String(o.value)">{{ o.label }}</option>
        </select>
        <div v-if="classError" class="field-error mt-1" role="alert">{{ validationText(classError) }}</div>
        <div v-if="options.length === 0" class="form-text">{{ t('students.move.noClasses') }}</div>
      </div>
      <div class="mb-3">
        <label for="move-date" class="form-label">{{ t('students.move.date') }}</label>
        <input id="move-date" v-model="date" type="date" class="form-control" :class="{ 'is-invalid': dateError }" />
        <div v-if="dateError" class="field-error mt-1" role="alert">{{ validationText(dateError) }}</div>
        <div class="form-text">{{ t('students.move.dateHint') }}</div>
      </div>
      <div v-if="needsReason" class="mb-0">
        <label for="move-reason" class="form-label">{{ t('students.move.reason') }}</label>
        <textarea id="move-reason" v-model="reason" class="form-control" rows="2" maxlength="200" />
      </div>
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" :disabled="saving" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="move-form" :variant="mode === 'leave' ? 'danger' : 'primary'" icon="check-lg" :loading="saving">{{ t(`students.move.${mode}Confirm`) }}</LoadingButton>
    </template>
  </BModal>
</template>
