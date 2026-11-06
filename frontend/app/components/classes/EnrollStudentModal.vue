<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { enrollmentsApi } from '~/services/enrollmentsApi';
import { studentsApi } from '~/services/studentsApi';
import type { StudentRow } from '~/types/api';
import { sortByKhmer } from '~/utils/sort';

// Put students into a class: search the active students who have no class in this class's year, then enrol with one click.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ classId: number; yearId: number }>();
const emit = defineEmits<{ enrolled: [] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const q = ref('');
const candidates = ref<StudentRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const busyId = ref<number | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

const shown = computed(() => candidates.value.slice(0, 50));

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    candidates.value = sortByKhmer(
      await studentsApi.list({ q: q.value, yearId: props.yearId, unenrolled: true, status: 'ACTIVE' }),
      (student) => student.nameKm,
    );
  } catch (e) {
    error.value = messageFor(e);
  } finally {
    loading.value = false;
  }
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  q.value = '';
  void load();
});
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
onBeforeUnmount(() => clearTimeout(timer));

async function enrol(student: StudentRow): Promise<void> {
  busyId.value = student.id;
  try {
    const result = await enrollmentsApi.enroll(student.id, props.classId);
    notify.success(t('classes.enrolled', { name: student.nameKm }));
    if (result.warnings.includes('CLASS_OVER_CAPACITY')) notify.warning(t('classes.overCapacity'));
    emit('enrolled');
    await load();
  } catch (e) {
    notify.error(messageFor(e));
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <BModal v-model="open" :title="t('classes.enrollTitle')" size="lg" centered no-close-on-backdrop>
    <label for="enroll-search" class="visually-hidden">{{ t('common.search') }}</label>
    <input id="enroll-search" v-model="q" type="search" class="form-control mb-3" :placeholder="t('classes.enrollSearchHint')" autocomplete="off" />
    <StateBlock :loading="loading" :error="error" :empty="shown.length === 0" :empty-text="t('classes.enrollEmpty')" @retry="load">
      <ul class="list-group">
        <li v-for="student in shown" :key="student.id" class="list-group-item d-flex justify-content-between align-items-center gap-2">
          <span>
            <span class="fw-medium">{{ student.nameKm }}</span>
            <span class="text-muted small ms-2">{{ student.studentCode }}</span>
          </span>
          <LoadingButton size="sm" variant="outline-primary" icon="plus-lg" :loading="busyId === student.id" @click="enrol(student)">{{ t('classes.enroll') }}</LoadingButton>
        </li>
      </ul>
      <p v-if="candidates.length > shown.length" class="text-muted small mt-2 mb-0">{{ t('classes.enrollMore', { n: candidates.length - shown.length }) }}</p>
    </StateBlock>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" @click="open = false">{{ t('common.close') }}</button>
    </template>
  </BModal>
</template>
