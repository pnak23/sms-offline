<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { useForm } from 'vee-validate';
import { eventSchema } from '~/schemas/events';
import { schoolEventsApi } from '~/services/dashboardApi';
import type { SchoolEvent } from '~/types/api';
import { todayIso } from '~/utils/date';

// Add a school event (`event` null) or edit one: a title, the day it starts, optionally the day it ends, and a note.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ event: SchoolEvent | null }>();
const emit = defineEmits<{ saved: []; stale: [] }>();

const { t } = useI18n();
const notify = useNotify();

const blank = () => ({ titleKm: '', startDate: todayIso(), endDate: '', note: '' });
const { handleSubmit, setErrors, resetForm } = useForm({ validationSchema: toTypedSchema(eventSchema), initialValues: blank() });
const submit = useSubmit({ fields: ['titleKm', 'startDate', 'endDate', 'note'], setErrors });

watch(open, (isOpen) => {
  if (!isOpen) return;
  submit.clearError();
  const e = props.event;
  resetForm({ values: e ? { titleKm: e.titleKm, startDate: e.startDate, endDate: e.endDate ?? '', note: e.note ?? '' } : blank() });
});

const onSubmit = handleSubmit(async (form) => {
  const target = props.event;
  const input = { titleKm: form.titleKm, startDate: form.startDate, endDate: form.endDate || null, note: form.note || null };
  const saved = await submit.run(() => (target ? schoolEventsApi.update(target.id, input, target.version) : schoolEventsApi.create(input)));
  if (!saved) {
    if (submit.lastError.value?.code === 'OPTIMISTIC_LOCK' || submit.lastError.value?.code === 'NOT_FOUND') {
      notify.warning(t('events.reloaded'));
      open.value = false;
      emit('stale');
    }
    return;
  }
  notify.success(t(target ? 'events.saved' : 'events.created'));
  open.value = false;
  emit('saved');
});
</script>

<template>
  <BModal v-model="open" :title="t(event ? 'events.editTitle' : 'events.addTitle')" centered no-close-on-backdrop>
    <form id="event-form" novalidate @submit.prevent="onSubmit">
      <FormAlert :message="submit.formError.value" />
      <FormInput name="titleKm" :label="t('events.titleLabel')" required :maxlength="150" autofocus />
      <div class="row">
        <div class="col-md-6"><FormInput name="startDate" type="date" :label="t('events.startDate')" required /></div>
        <div class="col-md-6"><FormInput name="endDate" type="date" :label="t('events.endDate')" :hint="t('events.endHint')" /></div>
      </div>
      <FormInput name="note" type="textarea" :label="t('events.note')" :maxlength="500" :rows="2" />
    </form>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton type="submit" form="event-form" icon="check-lg" :loading="submit.submitting.value">{{ t('common.save') }}</LoadingButton>
    </template>
  </BModal>
</template>
