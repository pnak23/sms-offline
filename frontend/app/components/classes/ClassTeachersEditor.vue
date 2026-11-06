<script setup lang="ts">
import { classesApi } from '~/services/classesApi';
import type { ClassAssignment, ClassDetail, Subject, Teacher } from '~/types/api';
import { sortByKhmer } from '~/utils/sort';

// Who teaches which subject in this class. One row per subject the grade studies (and that is active); one teacher per subject.
const props = defineProps<{
  classId: number;
  /** The subjects of the class's grade, already filtered to the active ones. */
  subjects: Subject[];
  /** Active teachers. */
  teachers: Teacher[];
  assignments: ClassAssignment[];
  /** The academic year is closed: shown, not editable. */
  readonly?: boolean;
}>();
const emit = defineEmits<{ saved: [detail: ClassDetail] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const choices = reactive<Record<number, string>>({});
const saving = ref(false);
const error = ref<string | null>(null);

function reset(): void {
  for (const key of Object.keys(choices)) delete choices[Number(key)];
  for (const a of props.assignments) choices[a.subjectId] = String(a.teacherId);
}
watch(() => props.assignments, reset, { immediate: true });

function optionsFor(subjectId: number) {
  const assigned = props.assignments.find((a) => a.subjectId === subjectId)?.teacherId;
  return sortByKhmer(
    props.teachers.filter((teacher) => teacher.status === 'ACTIVE' || teacher.id === assigned),
    (teacher) => teacher.nameKm,
  );
}

const dirty = computed(() => props.subjects.some((s) => (choices[s.id] ?? '') !== String(props.assignments.find((a) => a.subjectId === s.id)?.teacherId ?? '')));

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const assignments = props.subjects.filter((s) => choices[s.id]).map((s) => ({ subjectId: s.id, teacherId: Number(choices[s.id]) }));
    const detail = await classesApi.setTeachers(props.classId, assignments);
    notify.success(t('classes.teachersSaved'));
    emit('saved', detail);
  } catch (e) {
    error.value = messageFor(e);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <p v-if="subjects.length === 0" class="text-muted mb-0">{{ t('classes.noSubjects') }}</p>
    <template v-else>
      <FormAlert :message="error" />
      <div class="table-responsive scroll-x">
        <table class="table table-sm align-middle mb-3">
          <thead>
            <tr>
              <th>{{ t('classes.subject') }}</th>
              <th>{{ t('classes.teacher') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="subject in subjects" :key="subject.id">
              <th scope="row" class="fw-normal">{{ subject.nameKm }}</th>
              <td>
                <select
                  v-model="choices[subject.id]"
                  class="form-select form-select-sm"
                  :disabled="readonly || saving"
                  :aria-label="t('classes.teacherOf', { subject: subject.nameKm })"
                >
                  <option value="">{{ t('classes.noTeacher') }}</option>
                  <option v-for="teacher in optionsFor(subject.id)" :key="teacher.id" :value="String(teacher.id)">{{ teacher.nameKm }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <LoadingButton v-if="!readonly" icon="check-lg" :loading="saving" :disabled="!dirty" @click="save">{{ t('common.save') }}</LoadingButton>
    </template>
  </div>
</template>
