<script setup lang="ts">
import { teachersApi } from '~/services/teachersApi';
import type { Teacher } from '~/types/api';

// The weekly timetable. By class: the editor (pick a cell, choose a subject and a teacher). By teacher: a read-only week across all classes, with the lesson count. A
// student's own timetable is on the student's page. What is chosen travels in the address, so the printed page's Back returns here with the same choices. Nothing is
// invented: until the school enters its slots the page says so.
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { messageFor } = useApiError();

const positive = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const { years, classes, yearId, classId, loading, error, load } = useClassPicker();
yearId.value = positive(route.query.yearId);
classId.value = positive(route.query.classId);
const tab = ref<'class' | 'teacher'>(route.query.tab === 'teacher' ? 'teacher' : 'class');
const teacherId = ref<number | null>(positive(route.query.teacherId));
const teachers = ref<Teacher[]>([]);
const teacherError = ref<string | null>(null);

const returnPath = computed(() => {
  const query = new URLSearchParams({ tab: tab.value });
  if (yearId.value !== null) query.set('yearId', String(yearId.value));
  if (tab.value === 'class' && classId.value !== null) query.set('classId', String(classId.value));
  if (tab.value === 'teacher' && teacherId.value !== null) query.set('teacherId', String(teacherId.value));
  return `/timetable?${query.toString()}`;
});
watch(returnPath, (path) => {
  router.replace(path).catch(() => undefined);
});

async function start(): Promise<void> {
  await load();
  try {
    teachers.value = await teachersApi.list({});
  } catch (raised) {
    teacherError.value = messageFor(raised);
  }
}

onMounted(start);
useReloadOnReconnect(start);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('timetable.title')" :subtitle="t('timetable.subtitle')" />

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="loading" :error="error ?? teacherError" @retry="start">
          <p v-if="years.length === 0" class="mb-0">
            {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <ul class="nav nav-tabs mb-3" role="tablist">
              <li class="nav-item" role="presentation">
                <button id="timetable-tab-class" type="button" class="nav-link" :class="{ active: tab === 'class' }" role="tab" :aria-selected="tab === 'class'" data-testid="tt-tab-class" @click="tab = 'class'">
                  {{ t('timetable.tabClass') }}
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button id="timetable-tab-teacher" type="button" class="nav-link" :class="{ active: tab === 'teacher' }" role="tab" :aria-selected="tab === 'teacher'" data-testid="tt-tab-teacher" @click="tab = 'teacher'">
                  {{ t('timetable.tabTeacher') }}
                </button>
              </li>
            </ul>

            <div v-if="tab === 'class'" data-testid="tt-by-class">
              <div class="filter-bar">
                <ClassPicker v-model:year-id="yearId" v-model:class-id="classId" :years="years" :classes="classes" />
              </div>
              <TimetableByClass :year-id="yearId" :class-id="classId" :classes="classes" :return-path="returnPath" />
            </div>
            <div v-else data-testid="tt-by-teacher">
              <div class="filter-bar">
                <div>
                  <label for="tt-year-pick" class="visually-hidden">{{ t('classes.year') }}</label>
                  <select id="tt-year-pick" v-model="yearId" class="form-select" data-testid="tt-year-pick">
                    <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}{{ y.current ? ` (${t('academic.year.current')})` : '' }}</option>
                  </select>
                </div>
              </div>
              <TimetableByTeacher v-model:teacher-id="teacherId" :year-id="yearId" :teachers="teachers" :return-path="returnPath" />
            </div>
          </template>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
