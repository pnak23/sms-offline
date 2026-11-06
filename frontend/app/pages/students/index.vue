<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import { saveFile } from '~/services/desktop';
import { studentsApi } from '~/services/studentsApi';
import type { AcademicYear, ClassDto, Grade, StudentFilters, StudentRow } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { DATA_PAGE_DEFAULT, DATA_PAGE_SIZES } from '~/utils/pagination';
import { compareKhmer, sortByKhmer } from '~/utils/sort';

// Students: search by name, code, or a guardian's name/phone; filter by class, gender, status. The class shown is the one of the
// chosen academic year. Export the filtered list to Excel. A row opens the student's profile.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const { genderLabel, studentStatusLabel, genderOptions, studentStatusOptions } = useLabels();

const q = ref('');
const yearId = ref<number | null>(null);
const gradeId = ref('');
const classId = ref('');
const gender = ref('');
const status = ref('ACTIVE');
const unenrolled = ref(false);

const years = ref<AcademicYear[]>([]);
const grades = ref<Grade[]>([]);
const classes = ref<ClassDto[]>([]);
const rows = ref<StudentRow[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const exporting = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

const students = computed(() => sortByKhmer(rows.value, (row) => row.nameKm));
// the list is shown a page at a time (the whole filtered list is still loaded, and the Excel file has all of it)
const pager = usePagination(students, 'students', { fallback: DATA_PAGE_DEFAULT });

function filters(): StudentFilters {
  return {
    q: q.value,
    gender: gender.value,
    status: status.value,
    yearId: yearId.value,
    gradeId: gradeId.value ? Number(gradeId.value) : null,
    classId: classId.value ? Number(classId.value) : null,
    unenrolled: unenrolled.value,
  };
}

async function loadRows(): Promise<void> {
  loadError.value = null;
  try {
    rows.value = await studentsApi.list(filters());
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function loadClasses(): Promise<void> {
  if (yearId.value === null) {
    classes.value = [];
    return;
  }
  const list = await classesApi.list({ yearId: yearId.value, gradeId: gradeId.value ? Number(gradeId.value) : null });
  classes.value = [...list].sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));
}

async function load(): Promise<void> {
  try {
    [years.value, grades.value] = await Promise.all([academicApi.years(), academicApi.grades()]);
    if (yearId.value === null) yearId.value = (years.value.find((y) => y.current) ?? null)?.id ?? null;
    await loadClasses();
  } catch (error) {
    loadError.value = messageFor(error);
    loading.value = false;
    return;
  }
  await loadRows();
}

// the class list depends on the year and grade: a class chosen earlier may no longer be on offer
watch([yearId, gradeId], async () => {
  classId.value = '';
  try {
    await loadClasses();
  } catch (error) {
    loadError.value = messageFor(error);
  }
});
watch([q, yearId, gradeId, classId, gender, status, unenrolled], () => {
  pager.reset(); // a new search or filter is a new list: start at its first page
  clearTimeout(timer);
  timer = setTimeout(loadRows, 250);
});
onBeforeUnmount(() => clearTimeout(timer));
onMounted(load);
useReloadOnReconnect(load);

/** Column titles and value names for the Excel file: the server has no Khmer text of its own. */
function exportLabels(): Record<string, string> {
  const keys = ['sheet', 'no', 'code', 'nameKm', 'nameEn', 'gender', 'dateOfBirth', 'grade', 'class', 'status', 'guardian', 'guardianPhone', 'village', 'commune', 'district', 'province', 'address'];
  const labels = Object.fromEntries(keys.map((key) => [key, t(`students.export.${key}`)]));
  for (const g of ['MALE', 'FEMALE']) labels[g] = genderLabel(g);
  for (const s of ['ACTIVE', 'INACTIVE', 'GRADUATED']) labels[s] = studentStatusLabel(s);
  return labels;
}

async function exportExcel(): Promise<void> {
  exporting.value = true;
  try {
    const labels = exportLabels();
    const result = await saveFile(`${labels.sheet}.xlsx`, await studentsApi.exportExcel(filters(), labels));
    if (result.saved) notify.success(t('students.exported'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('students.title')" :subtitle="t('students.subtitle')">
      <NuxtLink to="/students/promotion" class="btn btn-outline-secondary"><AppIcon name="arrow-up-circle" />{{ t('students.promotion') }}</NuxtLink>
      <LoadingButton variant="outline-secondary" icon="file-earmark-excel" :loading="exporting" @click="exportExcel">{{ t('students.exportExcel') }}</LoadingButton>
      <NuxtLink to="/students/new" class="btn btn-primary"><AppIcon name="plus-lg" />{{ t('students.add') }}</NuxtLink>
    </PageHeader>

    <div class="card">
      <div class="card-body">
        <div class="filter-bar">
          <div class="filter-search">
            <label for="student-search" class="visually-hidden">{{ t('common.search') }}</label>
            <input id="student-search" v-model="q" type="search" class="form-control" :placeholder="t('students.searchHint')" autocomplete="off" />
          </div>
          <div>
            <label for="student-year" class="visually-hidden">{{ t('classes.year') }}</label>
            <select id="student-year" v-model="yearId" class="form-select">
              <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}{{ y.current ? ` (${t('academic.year.current')})` : '' }}</option>
            </select>
          </div>
          <div>
            <label for="student-grade" class="visually-hidden">{{ t('classes.grade') }}</label>
            <select id="student-grade" v-model="gradeId" class="form-select">
              <option value="">{{ t('classes.allGrades') }}</option>
              <option v-for="g in grades" :key="g.id" :value="String(g.id)">{{ g.nameKm }}</option>
            </select>
          </div>
          <div>
            <label for="student-class" class="visually-hidden">{{ t('classes.class') }}</label>
            <select id="student-class" v-model="classId" class="form-select">
              <option value="">{{ t('students.allClasses') }}</option>
              <option v-for="c in classes" :key="c.id" :value="String(c.id)">{{ c.gradeName }} {{ c.nameKm }}</option>
            </select>
          </div>
          <div>
            <label for="student-gender" class="visually-hidden">{{ t('common.gender') }}</label>
            <select id="student-gender" v-model="gender" class="form-select">
              <option value="">{{ t('students.anyGender') }}</option>
              <option v-for="o in genderOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div>
            <label for="student-status" class="visually-hidden">{{ t('common.status') }}</label>
            <select id="student-status" v-model="status" class="form-select">
              <option value="">{{ t('common.all') }}</option>
              <option v-for="o in studentStatusOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
          <div class="form-check filter-check">
            <input id="student-unenrolled" v-model="unenrolled" type="checkbox" class="form-check-input" />
            <label for="student-unenrolled" class="form-check-label">{{ t('students.onlyUnenrolled') }}</label>
          </div>
        </div>

        <StateBlock :loading="loading" :error="loadError" :empty="students.length === 0" :empty-text="t('students.empty')" @retry="load">
          <p class="text-muted small">{{ t('students.count', { n: students.length }) }}</p>
          <div class="table-responsive scroll-x">
            <table class="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>{{ t('students.code') }}</th>
                  <th>{{ t('students.nameKm') }}</th>
                  <th>{{ t('common.gender') }}</th>
                  <th>{{ t('students.dateOfBirth') }}</th>
                  <th>{{ t('students.class') }}</th>
                  <th>{{ t('common.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in pager.shown.value" :key="s.id">
                  <td class="text-nowrap">{{ s.studentCode }}</td>
                  <td>
                    <NuxtLink class="fw-medium" :to="`/students/${s.id}`">{{ s.nameKm }}</NuxtLink>
                    <div v-if="s.nameEn" class="text-muted small">{{ s.nameEn }}</div>
                  </td>
                  <td>{{ genderLabel(s.gender) }}</td>
                  <td class="text-nowrap">{{ formatDateKm(s.dateOfBirth) }}</td>
                  <td>{{ s.className ? `${s.gradeName} ${s.className}` : '—' }}</td>
                  <td>
                    <span class="badge" :class="{ 'text-bg-success': s.status === 'ACTIVE', 'text-bg-secondary': s.status === 'INACTIVE', 'text-bg-info': s.status === 'GRADUATED' }">
                      {{ studentStatusLabel(s.status) }}
                    </span>
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
            :sizes="DATA_PAGE_SIZES"
            :unit="t('students.unit')"
            test-id="students-pager"
          />
        </StateBlock>
      </div>
    </div>
  </div>
</template>
