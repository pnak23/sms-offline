<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import type { Subject } from '~/types/api';
import { isApiError } from '~/utils/apiError';

// Which subjects the school starts with. Each switch saves at once (PUT /subjects/{id}/active with the row's version).
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const subjects = ref<Subject[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busyId = ref<number | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    subjects.value = await academicApi.subjects();
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function toggle(subject: Subject, event: Event): Promise<void> {
  const active = (event.target as HTMLInputElement).checked;
  busyId.value = subject.id;
  try {
    const updated = await academicApi.setSubjectActive(subject.id, active, subject.version);
    subjects.value = subjects.value.map((s) => (s.id === updated.id ? updated : s));
  } catch (error) {
    (event.target as HTMLInputElement).checked = subject.active; // put the switch back
    if (isApiError(error) && error.code === 'OPTIMISTIC_LOCK') {
      await load();
      notify.warning(t('academic.subjects.reloaded'));
    } else {
      notify.error(messageFor(error));
    }
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <section>
    <h3 class="h5">{{ t('academic.subjects.title') }}</h3>
    <p class="text-muted mb-2">{{ t('academic.subjects.intro') }}</p>
    <StateBlock :loading="loading" :error="loadError" :empty="subjects.length === 0" @retry="load">
      <ul class="subject-list">
        <li v-for="subject in subjects" :key="subject.id" class="subject-item">
          <div class="form-check form-switch">
            <input
              :id="`subject-${subject.id}`"
              type="checkbox"
              role="switch"
              class="form-check-input"
              :checked="subject.active"
              :disabled="busyId === subject.id"
              @change="toggle(subject, $event)"
            />
            <label :for="`subject-${subject.id}`" class="form-check-label">
              {{ subject.nameKm }}
              <span v-if="subject.nameEn" class="text-muted small ms-1">{{ subject.nameEn }}</span>
            </label>
          </div>
        </li>
      </ul>
    </StateBlock>
  </section>
</template>
