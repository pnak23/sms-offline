<script setup lang="ts">
import { teachersApi } from '~/services/teachersApi';
import type { Teacher, TeacherClasses } from '~/types/api';
import { formatDateKm } from '~/utils/date';

// A teacher's profile: details, the classes they are homeroom teacher of, and the subjects they teach. Edit, deactivate, reactivate.
const { t } = useI18n();
const route = useRoute();
const { messageFor } = useApiError();
const notify = useNotify();
const { genderLabel, teacherStatusLabel } = useLabels();

const id = Number(route.params.id);
const teacher = ref<Teacher | null>(null);
const classes = ref<TeacherClasses | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
const confirmOff = ref(false);
const busy = ref(false);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    [teacher.value, classes.value] = await Promise.all([teachersApi.get(id), teachersApi.classes(id)]);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function setActive(active: boolean): Promise<void> {
  if (!teacher.value) return;
  busy.value = true;
  try {
    teacher.value = await teachersApi.setActive(id, active, teacher.value.version);
    notify.success(t(active ? 'teachers.reactivated' : 'teachers.deactivated'));
  } catch (error) {
    notify.error(messageFor(error));
    await load();
  } finally {
    busy.value = false;
    confirmOff.value = false;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="teacher?.nameKm ?? t('teachers.title')" :subtitle="teacher?.teacherCode">
      <NuxtLink to="/teachers" class="btn btn-outline-secondary"><AppIcon name="arrow-left" />{{ t('common.back') }}</NuxtLink>
      <button v-if="teacher" type="button" class="btn btn-outline-primary" @click="showForm = true"><AppIcon name="pencil" />{{ t('common.edit') }}</button>
      <LoadingButton
        v-if="teacher && teacher.status === 'ACTIVE'"
        variant="outline-secondary"
        icon="lock"
        :loading="busy"
        @click="confirmOff = true"
      >
        {{ t('teachers.deactivate') }}
      </LoadingButton>
      <LoadingButton v-else-if="teacher" variant="outline-primary" icon="unlock" :loading="busy" @click="setActive(true)">{{ t('teachers.reactivate') }}</LoadingButton>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <template v-if="teacher && classes">
        <div class="card mb-3">
          <div class="card-body">
            <dl class="summary-list mb-0">
              <dt>{{ t('common.status') }}</dt>
              <dd>
                <span class="badge" :class="teacher.status === 'ACTIVE' ? 'text-bg-success' : 'text-bg-secondary'">{{ teacherStatusLabel(teacher.status) }}</span>
              </dd>
              <dt>{{ t('common.gender') }}</dt>
              <dd>{{ genderLabel(teacher.gender) }}</dd>
              <dt>{{ t('common.phone') }}</dt>
              <dd>{{ teacher.phone ?? '—' }}</dd>
              <dt>{{ t('teachers.specialization') }}</dt>
              <dd>{{ teacher.specialization ?? '—' }}</dd>
              <dt>{{ t('teachers.employmentDate') }}</dt>
              <dd>{{ teacher.employmentDate ? formatDateKm(teacher.employmentDate) : '—' }}</dd>
              <dt>{{ t('common.address') }}</dt>
              <dd>{{ teacher.address ?? '—' }}</dd>
            </dl>
          </div>
        </div>

        <div class="card">
          <div class="card-body">
            <h2 class="h5">{{ t('teachers.classesTitle') }}</h2>
            <p v-if="classes.homeroomClasses.length === 0 && classes.assignments.length === 0" class="text-muted mb-0">{{ t('teachers.noClasses') }}</p>
            <template v-else>
              <h3 v-if="classes.homeroomClasses.length" class="h6">{{ t('teachers.homeroomOf') }}</h3>
              <ul v-if="classes.homeroomClasses.length" class="mb-3">
                <li v-for="c in classes.homeroomClasses" :key="c.id">
                  <NuxtLink :to="`/classes/${c.id}`">{{ c.gradeName }} {{ c.nameKm }}</NuxtLink>
                  <span class="text-muted"> · {{ c.yearName }}</span>
                </li>
              </ul>
              <div v-if="classes.assignments.length" class="table-responsive scroll-x">
                <table class="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>{{ t('classes.year') }}</th>
                      <th>{{ t('classes.class') }}</th>
                      <th>{{ t('classes.subject') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in classes.assignments" :key="`${a.classId}-${a.subjectId}`">
                      <td>{{ a.yearName }}</td>
                      <td><NuxtLink :to="`/classes/${a.classId}`">{{ a.gradeName }} {{ a.className }}</NuxtLink></td>
                      <td>{{ a.subjectName }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </div>
        <TeacherTimetableCard :teacher-id="id" />
      </template>
    </StateBlock>

    <TeacherFormModal v-model="showForm" :teacher="teacher" @saved="load" @stale="load" />
    <ConfirmModal
      v-model="confirmOff"
      :title="t('teachers.deactivateTitle')"
      :message="t('teachers.deactivateMessage', { name: teacher?.nameKm ?? '' })"
      :confirm-label="t('teachers.deactivate')"
      :loading="busy"
      @confirm="setActive(false)"
    />
  </div>
</template>
