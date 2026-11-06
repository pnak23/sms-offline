<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import type { Grade, Subject } from '~/types/api';
import { idsWithout, subjectTree } from '~/utils/subjectTree';

// Which subjects each grade studies: one row per ACTIVE subject (a main subject, then its sub-subjects indented), one column per grade. A tick saves that grade
// at once (PUT /grades/{id}/subjects replaces the grade's whole set). A sub-subject can only be ticked for a grade that studies its main subject, and
// switching a main subject off for a grade takes its sub-subjects with it. `refreshKey` changes when subjects were added or switched.
const props = defineProps<{ refreshKey?: number }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const grades = ref<Grade[]>([]);
const subjects = ref<Subject[]>([]);
const loaded = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busyGradeId = ref<number | null>(null);
const activeSubjects = computed(() => subjects.value.filter((subject) => subject.active));
/** The rows: every active main subject with its active sub-subjects below it. */
const nodes = computed(() => subjectTree(activeSubjects.value));
// a long table is shown a page at a time, by MAIN subject (a main subject and its sub-subjects stay together)
const pager = usePagination(nodes, 'grade-subjects');
const rows = computed(() => pager.shown.value.flatMap((node) => [{ subject: node.subject, sub: false }, ...node.subs.map((s) => ({ subject: s, sub: true }))]));

async function load(): Promise<void> {
  if (!loaded.value) loading.value = true;
  loadError.value = null;
  try {
    [grades.value, subjects.value] = await Promise.all([academicApi.grades(), academicApi.subjects()]);
    loaded.value = true;
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function toggle(grade: Grade, subject: Subject, event: Event): Promise<void> {
  const checked = (event.target as HTMLInputElement).checked;
  const ids = checked ? [...new Set([...grade.subjectIds, subject.id])] : idsWithout(subjects.value, grade.subjectIds, subject);
  busyGradeId.value = grade.id;
  try {
    const updated = await academicApi.setGradeSubjects(grade.id, ids);
    grades.value = grades.value.map((g) => (g.id === updated.id ? updated : g));
  } catch (error) {
    (event.target as HTMLInputElement).checked = !checked; // put the tick back
    notify.error(messageFor(error));
  } finally {
    busyGradeId.value = null;
  }
}

watch(() => props.refreshKey, load);
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <StateBlock :loading="loading" :error="loadError" @retry="load">
    <p v-if="activeSubjects.length === 0" class="text-muted mb-0">{{ t('academic.grades.matrixEmpty') }}</p>
    <div v-else class="table-responsive scroll-x">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th scope="col">{{ t('academic.subjects.title') }}</th>
            <th v-for="grade in grades" :key="grade.id" scope="col" class="text-center text-nowrap">{{ grade.nameKm }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ subject, sub } in rows" :key="subject.id" :data-kind="sub ? 'sub' : 'main'">
            <th scope="row" :class="sub ? 'fw-normal ps-4' : 'fw-semibold'"><span v-if="sub" class="text-muted me-1" aria-hidden="true">↳</span>{{ subject.nameKm }}</th>
            <td v-for="grade in grades" :key="grade.id" class="text-center">
              <input
                type="checkbox"
                class="form-check-input"
                :checked="grade.subjectIds.includes(subject.id)"
                :disabled="busyGradeId === grade.id || (sub && !grade.subjectIds.includes(subject.parentId ?? -1))"
                :aria-label="t('academic.grades.matrixCell', { subject: subject.nameKm, grade: grade.nameKm })"
                @change="toggle(grade, subject, $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ListPager
      v-model:page="pager.page.value"
      v-model:size="pager.size.value"
      :total="pager.total.value"
      :page-count="pager.pageCount.value"
      :from="pager.range.value.from"
      :to="pager.range.value.to"
      :unit="t('academic.subjects.unit')"
      test-id="grade-subjects-pager"
    />
  </StateBlock>
</template>
