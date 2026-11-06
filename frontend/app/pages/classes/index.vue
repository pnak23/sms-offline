<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import { teachersApi } from '~/services/teachersApi';
import type { AcademicYear, ClassDetail, ClassDto, Grade, Teacher } from '~/types/api';
import { DATA_PAGE_DEFAULT, DATA_PAGE_SIZES } from '~/utils/pagination';
import { compareKhmer } from '~/utils/sort';

// Classes of one academic year (the current one by default), by grade. A row opens the class: subject teachers and students.
const { t } = useI18n();
const { messageFor } = useApiError();

const years = ref<AcademicYear[]>([]);
const grades = ref<Grade[]>([]);
const teachers = ref<Teacher[]>([]);
const classes = ref<ClassDto[]>([]);
const yearId = ref<number | null>(null);
const gradeId = ref('');
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);

const year = computed(() => years.value.find((y) => y.id === yearId.value) ?? null);
const closed = computed(() => year.value?.status === 'CLOSED');
// the list is shown a page at a time
const pager = usePagination(classes, 'classes', { fallback: DATA_PAGE_DEFAULT });

async function loadClasses(): Promise<void> {
  if (yearId.value === null) {
    classes.value = [];
    return;
  }
  const list = await classesApi.list({ yearId: yearId.value, gradeId: gradeId.value ? Number(gradeId.value) : null });
  classes.value = [...list].sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));
}

async function load(): Promise<void> {
  loadError.value = null;
  try {
    [years.value, grades.value, teachers.value] = await Promise.all([academicApi.years(), academicApi.grades(), teachersApi.list({ status: 'ACTIVE' })]);
    if (yearId.value === null) yearId.value = (years.value.find((y) => y.current) ?? years.value[0])?.id ?? null;
    await loadClasses();
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

/** After adding a class: reload, and show the page the new class is on. */
async function saved(detail: ClassDetail): Promise<void> {
  await loadClasses();
  const at = classes.value.findIndex((row) => row.id === detail.schoolClass.id);
  if (at >= 0) pager.goToIndex(at);
}

watch([yearId, gradeId], () => {
  pager.reset(); // another year or grade is another list: start at its first page
  loadClasses().catch((error) => {
    loadError.value = messageFor(error);
  });
});
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('classes.title')" :subtitle="t('classes.subtitle')">
      <button type="button" class="btn btn-primary" :disabled="yearId === null || closed" @click="showForm = true"><AppIcon name="plus-lg" />{{ t('classes.add') }}</button>
    </PageHeader>

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="loading" :error="loadError" @retry="load">
          <p v-if="years.length === 0" class="mb-0">
            {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <div class="filter-bar">
              <div>
                <label for="class-year" class="visually-hidden">{{ t('classes.year') }}</label>
                <select id="class-year" v-model="yearId" class="form-select">
                  <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}{{ y.current ? ` (${t('academic.year.current')})` : '' }}</option>
                </select>
              </div>
              <div>
                <label for="class-grade" class="visually-hidden">{{ t('classes.grade') }}</label>
                <select id="class-grade" v-model="gradeId" class="form-select">
                  <option value="">{{ t('classes.allGrades') }}</option>
                  <option v-for="g in grades" :key="g.id" :value="String(g.id)">{{ g.nameKm }}</option>
                </select>
              </div>
            </div>
            <p v-if="closed" class="text-muted">{{ t('classes.yearClosed') }}</p>

            <p v-if="classes.length === 0" class="text-muted mb-0">{{ t('classes.empty') }}</p>
            <div v-else class="table-responsive scroll-x">
              <table class="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>{{ t('classes.grade') }}</th>
                    <th>{{ t('classes.name') }}</th>
                    <th>{{ t('classes.homeroomTeacher') }}</th>
                    <th class="text-end">{{ t('classes.students') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in pager.shown.value" :key="c.id">
                    <td>{{ c.gradeName }}</td>
                    <td class="fw-medium"><NuxtLink :to="`/classes/${c.id}`">{{ c.nameKm }}</NuxtLink></td>
                    <td>{{ c.homeroomTeacherName ?? '—' }}</td>
                    <td class="text-end text-nowrap">
                      <span :class="{ 'text-danger fw-semibold': c.studentCount > c.capacity }">{{ c.studentCount }} / {{ c.capacity }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ListPager
              v-if="classes.length > 0"
              v-model:page="pager.page.value"
              v-model:size="pager.size.value"
              :total="pager.total.value"
              :page-count="pager.pageCount.value"
              :from="pager.range.value.from"
              :to="pager.range.value.to"
              :sizes="DATA_PAGE_SIZES"
              :unit="t('classes.unit')"
              test-id="classes-pager"
            />
          </template>
        </StateBlock>
      </div>
    </div>

    <ClassFormModal v-model="showForm" :school-class="null" :year-id="yearId" :year-name="year?.nameKm ?? ''" :grades="grades" :teachers="teachers" @saved="saved" />
  </div>
</template>
