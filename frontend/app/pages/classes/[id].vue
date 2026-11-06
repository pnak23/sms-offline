<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import { teachersApi } from '~/services/teachersApi';
import type { AcademicYear, ClassDetail, Grade, RosterRow, Subject, Teacher } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { sortByKhmer } from '~/utils/sort';

// One class: who the homeroom and subject teachers are, and who the students are. Edit, delete (only if nobody was ever in it), enrol students.
const { t } = useI18n();
const route = useRoute();
const { messageFor } = useApiError();
const notify = useNotify();
const { genderLabel } = useLabels();

const id = Number(route.params.id);
const detail = ref<ClassDetail | null>(null);
const years = ref<AcademicYear[]>([]);
const grades = ref<Grade[]>([]);
const subjects = ref<Subject[]>([]);
const teachers = ref<Teacher[]>([]);
const roster = ref<RosterRow[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const showEnroll = ref(false);
const confirmDelete = ref(false);
const deleting = ref(false);

const schoolClass = computed(() => detail.value?.schoolClass ?? null);
const closed = computed(() => years.value.find((y) => y.id === schoolClass.value?.academicYearId)?.status === 'CLOSED');
const gradeSubjects = computed(() => {
  const grade = grades.value.find((g) => g.id === schoolClass.value?.gradeId);
  return subjects.value.filter((s) => s.active && s.parentId === null && grade?.subjectIds.includes(s.id));   // the teachers of a class are chosen per main subject
});
const students = computed(() => sortByKhmer(roster.value, (row) => row.nameKm));

async function load(): Promise<void> {
  loadError.value = null;
  try {
    [detail.value, years.value, grades.value, subjects.value, teachers.value, roster.value] = await Promise.all([
      classesApi.get(id),
      academicApi.years(),
      academicApi.grades(),
      academicApi.subjects(),
      teachersApi.list({ status: 'ACTIVE' }),
      classesApi.students(id),
    ]);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function remove(): Promise<void> {
  deleting.value = true;
  try {
    await classesApi.remove(id);
    notify.success(t('classes.deleted'));
    await navigateTo('/classes');
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    deleting.value = false;
    confirmDelete.value = false;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="schoolClass ? `${schoolClass.gradeName} ${schoolClass.nameKm}` : t('classes.title')" :subtitle="schoolClass?.yearName">
      <NuxtLink to="/classes" class="btn btn-outline-secondary"><AppIcon name="arrow-left" />{{ t('common.back') }}</NuxtLink>
      <template v-if="schoolClass && !closed">
        <button type="button" class="btn btn-outline-primary" @click="showEnroll = true"><AppIcon name="plus-lg" />{{ t('classes.enrollTitle') }}</button>
        <button type="button" class="btn btn-outline-secondary" @click="showForm = true"><AppIcon name="pencil" />{{ t('common.edit') }}</button>
        <button type="button" class="btn btn-outline-danger" @click="confirmDelete = true"><AppIcon name="trash" />{{ t('common.delete') }}</button>
      </template>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <template v-if="schoolClass && detail">
        <p v-if="closed" class="text-muted">{{ t('classes.yearClosed') }}</p>

        <div class="card mb-3">
          <div class="card-body">
            <dl class="summary-list mb-0">
              <dt>{{ t('classes.homeroomTeacher') }}</dt>
              <dd>
                <NuxtLink v-if="schoolClass.homeroomTeacherId" :to="`/teachers/${schoolClass.homeroomTeacherId}`">{{ schoolClass.homeroomTeacherName }}</NuxtLink>
                <span v-else>—</span>
              </dd>
              <dt>{{ t('classes.capacityShort') }}</dt>
              <dd>
                {{ schoolClass.studentCount }} / {{ schoolClass.capacity }}
                <span v-if="schoolClass.studentCount > schoolClass.capacity" class="badge text-bg-warning ms-2">{{ t('classes.overCapacityBadge') }}</span>
              </dd>
            </dl>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card-body">
            <h2 class="h5">{{ t('classes.teachersTitle') }}</h2>
            <ClassTeachersEditor
              :class-id="id"
              :subjects="gradeSubjects"
              :teachers="teachers"
              :assignments="detail.assignments"
              :readonly="closed"
              @saved="detail = $event"
            />
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <h2 class="h5">{{ t('classes.studentsTitle') }}</h2>
            <p v-if="students.length === 0" class="text-muted mb-0">{{ t('classes.noStudents') }}</p>
            <div v-else class="table-responsive scroll-x">
              <table class="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>{{ t('students.code') }}</th>
                    <th>{{ t('students.nameKm') }}</th>
                    <th>{{ t('common.gender') }}</th>
                    <th>{{ t('students.dateOfBirth') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in students" :key="s.enrollmentId">
                    <td class="text-nowrap">{{ s.studentCode }}</td>
                    <td class="fw-medium"><NuxtLink :to="`/students/${s.studentId}`">{{ s.nameKm }}</NuxtLink></td>
                    <td>{{ genderLabel(s.gender) }}</td>
                    <td>{{ formatDateKm(s.dateOfBirth) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </StateBlock>

    <ClassFormModal v-model="showForm" :school-class="schoolClass" :year-id="schoolClass?.academicYearId ?? null" :year-name="schoolClass?.yearName ?? ''" :grades="grades" :teachers="teachers" @saved="load" @stale="load" />
    <EnrollStudentModal v-if="schoolClass" v-model="showEnroll" :class-id="id" :year-id="schoolClass.academicYearId" @enrolled="load" />
    <ConfirmModal
      v-model="confirmDelete"
      :title="t('classes.deleteTitle')"
      :message="t('classes.deleteMessage', { name: schoolClass?.nameKm ?? '' })"
      :confirm-label="t('common.delete')"
      :loading="deleting"
      @confirm="remove"
    />
  </div>
</template>
