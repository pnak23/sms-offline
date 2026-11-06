<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { subjectSchema } from '~/schemas/academic';
import { academicApi } from '~/services/academicApi';
import type { Subject } from '~/types/api';

// Add a subject or a sub-subject, or rename one (Settings -> Academic). `subject` set = renaming it; otherwise a new subject is added, under `parent` when the
// "add sub-subject" button of a main subject opened this (the main subject can still be changed in the form), as a main subject of its own otherwise.
// A sub-subject keeps its main subject: it is deactivated and created again, never moved.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ subject: Subject | null; parent: Subject | null; mains: Subject[] }>();
/** `saved` carries the subject that was added or renamed, so the list can show the page it is on. */
const emit = defineEmits<{ saved: [subject: Subject]; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

/** The main subject a new subject goes under ('' = it is a main subject itself). */
const parentChoice = ref('');
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(subjectSchema), initialValues: { nameKm: '', nameEn: '' } });
const submit = useSubmit({ fields: ['nameKm', 'nameEn'], setErrors });

const parentOfEdited = computed(() => props.mains.find((m) => m.id === props.subject?.parentId)?.nameKm ?? null);
const title = computed(() => {
  if (props.subject) return t('academic.subjects.renameTitle');
  const chosen = props.mains.find((m) => String(m.id) === parentChoice.value);
  return chosen ? t('academic.subjects.addSubTitle', { subject: chosen.nameKm }) : t('academic.subjects.add');
});

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const s = props.subject;
  parentChoice.value = !s && props.parent ? String(props.parent.id) : '';
  resetForm({ values: s ? { nameKm: s.nameKm, nameEn: s.nameEn ?? '' } : { nameKm: '', nameEn: '' } });
});

const onSubmit = handleSubmit(async (form) => {
  const target = props.subject;
  const saved = await submit.run(() => (target ? academicApi.updateSubject(target.id, form, target.version) : academicApi.createSubject({ ...form, parentId: parentChoice.value === '' ? null : Number(parentChoice.value) })));
  if (!saved) {
    if (submit.lastError.value?.code === 'OPTIMISTIC_LOCK') {
      notify.warning(t('academic.subjects.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'academic.subjects.renamed' : 'academic.subjects.created'));
  open.value = false;
  emit('saved', saved);
});
</script>

<template>
  <BModal v-model="open" :title="title" centered no-close-on-backdrop lazy unmount-lazy>
    <form id="subject-form" class="subject-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <p v-if="subject && parentOfEdited" class="text-muted small">{{ t('academic.subjects.partOf', { subject: parentOfEdited }) }}</p>
      <p v-else-if="!subject && parentChoice === ''" class="text-muted small">{{ t('academic.subjects.addHint') }}</p>
      <div v-if="!subject" class="mb-3">
        <label for="subject-parent" class="form-label">{{ t('academic.subjects.parent') }}</label>
        <select id="subject-parent" v-model="parentChoice" class="form-select">
          <option value="">{{ t('academic.subjects.noParent') }}</option>
          <option v-for="m in mains" :key="m.id" :value="String(m.id)">{{ m.nameKm }}</option>
        </select>
        <div class="form-text">{{ t('academic.subjects.parentHint') }}</div>
      </div>
      <FormInput name="nameKm" :label="t('academic.subjects.nameKm')" required :maxlength="100" autofocus />
      <FormInput name="nameEn" :label="t('academic.subjects.nameEn')" :maxlength="100" />
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="subject-form" :icon="subject ? 'check-lg' : 'plus-lg'" :loading="submit.submitting.value">
        {{ t(subject ? 'common.save' : 'academic.subjects.create') }}
      </LoadingButton>
    </template>
  </BModal>
</template>
