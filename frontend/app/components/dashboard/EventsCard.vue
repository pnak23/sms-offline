<script setup lang="ts">
import { schoolEventsApi } from '~/services/dashboardApi';
import type { SchoolEvent } from '~/types/api';
import { formatDateKm } from '~/utils/date';

// The upcoming events of the school (an exam week, a holiday, a meeting): add, edit and delete them here.
defineProps<{ events: SchoolEvent[] }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const notify = useNotify();
const { messageFor } = useApiError();

const editing = ref<SchoolEvent | null>(null);
const showForm = ref(false);
const removing = ref<SchoolEvent | null>(null);
const deleting = ref(false);
const confirmOpen = computed({
  get: () => removing.value !== null,
  set: (open) => {
    if (!open) removing.value = null;
  },
});

const when = (e: SchoolEvent): string => (e.endDate && e.endDate !== e.startDate ? `${formatDateKm(e.startDate)} → ${formatDateKm(e.endDate)}` : formatDateKm(e.startDate));

function openForm(event: SchoolEvent | null): void {
  editing.value = event;
  showForm.value = true;
}

async function remove(): Promise<void> {
  const target = removing.value;
  if (!target) return;
  deleting.value = true;
  try {
    await schoolEventsApi.remove(target.id);
    notify.success(t('events.deleted'));
    emit('changed');
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    deleting.value = false;
    removing.value = null;
  }
}
</script>

<template>
  <div class="card h-100" data-testid="events-card">
    <div class="card-header d-flex align-items-center">
      <span class="me-auto"><AppIcon name="calendar-event" class="me-2" />{{ t('events.title') }}</span>
      <button type="button" class="btn btn-outline-primary btn-sm" @click="openForm(null)"><AppIcon name="plus-lg" />{{ t('events.add') }}</button>
    </div>
    <div class="card-body">
      <p v-if="events.length === 0" class="text-muted mb-0">{{ t('events.empty') }}</p>
      <ul v-else class="list-unstyled mb-0">
        <li v-for="e in events" :key="e.id" class="d-flex align-items-start gap-2 mb-2" :data-event="e.titleKm">
          <div class="me-auto">
            <div class="fw-medium">{{ e.titleKm }}</div>
            <div class="small text-muted">{{ when(e) }}</div>
            <div v-if="e.note" class="small">{{ e.note }}</div>
          </div>
          <button type="button" class="btn btn-outline-secondary btn-sm" :aria-label="t('common.edit')" :title="t('common.edit')" @click="openForm(e)"><AppIcon name="pencil" /></button>
          <button type="button" class="btn btn-outline-danger btn-sm" :aria-label="t('common.delete')" :title="t('common.delete')" @click="removing = e"><AppIcon name="trash" /></button>
        </li>
      </ul>
    </div>

    <SchoolEventModal v-model="showForm" :event="editing" @saved="emit('changed')" @stale="emit('changed')" />
    <ConfirmModal v-model="confirmOpen" :title="t('events.deleteTitle')" :message="t('events.deleteMessage', { title: removing?.titleKm ?? '' })" :confirm-label="t('common.delete')" :loading="deleting" @confirm="remove" />
  </div>
</template>
