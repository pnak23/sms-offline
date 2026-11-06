<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import { classesApi } from '~/services/classesApi';
import { studentsApi } from '~/services/studentsApi';
import type { AcademicYear, ClassDto, StudentDetail, StudentStatus } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { compareKhmer } from '~/utils/sort';

// A student's profile: photo, details, guardians, and every enrollment (the history). Edit, enrol / move / leave, mark inactive or
// graduated, print, delete (only a student without history).
const { t } = useI18n();
const route = useRoute();
const { messageFor } = useApiError();
const notify = useNotify();
const { genderLabel, relationshipLabel, studentStatusLabel, enrollmentStatusLabel } = useLabels();

const id = Number(route.params.id);
const detail = ref<StudentDetail | null>(null);
const years = ref<AcademicYear[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const editing = ref(false);
const busy = ref(false);

const moveMode = ref<'enroll' | 'transfer' | 'leave'>('enroll');
const showMove = ref(false);
const moveClasses = ref<ClassDto[]>([]);
const confirmStatus = ref<StudentStatus | null>(null);
const confirmDelete = ref(false);

const student = computed(() => detail.value?.student ?? null);
const active = computed(() => detail.value?.enrollments.find((e) => e.status === 'ACTIVE') ?? null);
const currentYear = computed(() => years.value.find((y) => y.current && y.status === 'OPEN') ?? null);
const statusConfirmOpen = computed({
  get: () => confirmStatus.value !== null,
  set: (open: boolean) => {
    if (!open) confirmStatus.value = null;
  },
});

async function load(): Promise<void> {
  loadError.value = null;
  try {
    [detail.value, years.value] = await Promise.all([studentsApi.get(id), academicApi.years()]);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

/** The dialog needs the classes it may choose from: those of the current year to enrol, of the enrollment's own year to move. */
async function openMove(mode: 'enroll' | 'transfer' | 'leave'): Promise<void> {
  try {
    if (mode !== 'leave') {
      const yearId = mode === 'enroll' ? currentYear.value?.id : active.value?.academicYearId;
      const list = yearId ? await classesApi.list({ yearId }) : [];
      moveClasses.value = list
        .filter((c) => c.id !== active.value?.classId)
        .sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));
    }
    moveMode.value = mode;
    showMove.value = true;
  } catch (error) {
    notify.error(messageFor(error));
  }
}

async function changeStatus(status: StudentStatus): Promise<void> {
  if (!student.value) return;
  busy.value = true;
  try {
    detail.value = await studentsApi.setStatus(id, status, student.value.version);
    notify.success(t(`students.statusDone.${status}`));
  } catch (error) {
    notify.error(messageFor(error));
    await load();
  } finally {
    busy.value = false;
    confirmStatus.value = null;
  }
}

async function remove(): Promise<void> {
  busy.value = true;
  try {
    await studentsApi.remove(id);
    notify.success(t('students.deleted'));
    await navigateTo('/students');
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busy.value = false;
    confirmDelete.value = false;
  }
}

function saved(next: StudentDetail): void {
  detail.value = next;
  editing.value = false;
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="student?.nameKm ?? t('students.title')" :subtitle="student?.studentCode">
      <NuxtLink to="/students" class="btn btn-outline-secondary"><AppIcon name="arrow-left" />{{ t('common.back') }}</NuxtLink>
      <template v-if="student && !editing">
        <NuxtLink :to="`/print/student/${id}`" class="btn btn-outline-secondary"><AppIcon name="printer" />{{ t('students.printProfile') }}</NuxtLink>
        <button type="button" class="btn btn-outline-primary" @click="editing = true"><AppIcon name="pencil" />{{ t('common.edit') }}</button>
      </template>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <template v-if="student && detail">
        <div v-if="editing" class="card">
          <div class="card-body"><StudentForm :detail="detail" @saved="saved" @cancel="editing = false" @stale="editing = false; load()" /></div>
        </div>

        <template v-else>
          <div class="card mb-3">
            <div class="card-body profile-grid">
              <StudentPhoto :student="student" @updated="detail = $event" />
              <div>
                <dl class="summary-list mb-3">
                  <dt>{{ t('common.status') }}</dt>
                  <dd>
                    <span class="badge" :class="{ 'text-bg-success': student.status === 'ACTIVE', 'text-bg-secondary': student.status === 'INACTIVE', 'text-bg-info': student.status === 'GRADUATED' }">
                      {{ studentStatusLabel(student.status) }}
                    </span>
                  </dd>
                  <dt>{{ t('students.nameEn') }}</dt>
                  <dd>{{ student.nameEn ?? '—' }}</dd>
                  <dt>{{ t('common.gender') }}</dt>
                  <dd>{{ genderLabel(student.gender) }}</dd>
                  <dt>{{ t('students.dateOfBirth') }}</dt>
                  <dd>{{ formatDateKm(student.dateOfBirth) }}</dd>
                  <dt>{{ t('students.placeOfBirth') }}</dt>
                  <dd>{{ student.placeOfBirth ?? '—' }}</dd>
                  <dt>{{ t('common.address') }}</dt>
                  <dd>{{ [student.address, student.village, student.commune, student.district, student.province].filter(Boolean).join(' · ') || '—' }}</dd>
                  <dt>{{ t('students.enrollmentDate') }}</dt>
                  <dd>{{ formatDateKm(student.enrollmentDate) }}</dd>
                  <dt>{{ t('common.notes') }}</dt>
                  <dd>{{ student.notes ?? '—' }}</dd>
                </dl>
                <div class="d-flex flex-wrap gap-2">
                  <button v-if="student.status === 'ACTIVE' && !active && currentYear" type="button" class="btn btn-primary btn-sm" @click="openMove('enroll')">
                    <AppIcon name="plus-lg" />{{ t('students.move.enrollTitle') }}
                  </button>
                  <button v-if="active" type="button" class="btn btn-outline-primary btn-sm" @click="openMove('transfer')">
                    <AppIcon name="arrow-left-right" />{{ t('students.move.transferTitle') }}
                  </button>
                  <button v-if="active" type="button" class="btn btn-outline-secondary btn-sm" @click="openMove('leave')">
                    <AppIcon name="box-arrow-right" />{{ t('students.move.leaveTitle') }}
                  </button>
                  <button v-if="student.status === 'ACTIVE'" type="button" class="btn btn-outline-secondary btn-sm" @click="confirmStatus = 'GRADUATED'">
                    <AppIcon name="mortarboard" />{{ t('students.markGraduated') }}
                  </button>
                  <button v-if="student.status === 'ACTIVE'" type="button" class="btn btn-outline-secondary btn-sm" @click="confirmStatus = 'INACTIVE'">
                    <AppIcon name="lock" />{{ t('students.markInactive') }}
                  </button>
                  <LoadingButton v-if="student.status !== 'ACTIVE'" variant="outline-primary" size="sm" icon="unlock" :loading="busy" @click="changeStatus('ACTIVE')">
                    {{ t('students.reactivate') }}
                  </LoadingButton>
                  <button type="button" class="btn btn-outline-danger btn-sm" @click="confirmDelete = true"><AppIcon name="trash" />{{ t('common.delete') }}</button>
                </div>
              </div>
            </div>
          </div>

          <div class="card mb-3">
            <div class="card-body">
              <h2 class="h5">{{ t('students.sectionGuardians') }}</h2>
              <p v-if="detail.guardians.length === 0" class="text-muted mb-0">{{ t('students.noGuardians') }}</p>
              <div v-else class="table-responsive scroll-x">
                <table class="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>{{ t('students.guardianName') }}</th>
                      <th>{{ t('students.relationship') }}</th>
                      <th>{{ t('common.phone') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="g in detail.guardians" :key="g.id">
                      <td>
                        {{ g.nameKm }}
                        <span v-if="g.primary" class="badge text-bg-primary ms-1">{{ t('students.primaryGuardian') }}</span>
                      </td>
                      <td>{{ relationshipLabel(g.relationship) }}</td>
                      <td class="text-nowrap">{{ g.phone ?? '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-body">
              <h2 class="h5">{{ t('students.historyTitle') }}</h2>
              <p v-if="detail.enrollments.length === 0" class="text-muted mb-0">{{ t('students.noHistory') }}</p>
              <div v-else class="table-responsive scroll-x">
                <table class="table table-sm mb-0">
                  <thead>
                    <tr>
                      <th>{{ t('classes.year') }}</th>
                      <th>{{ t('students.class') }}</th>
                      <th>{{ t('common.status') }}</th>
                      <th>{{ t('students.move.date') }}</th>
                      <th>{{ t('students.move.reason') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="e in detail.enrollments" :key="e.enrollmentId">
                      <td>{{ e.yearName }}</td>
                      <td><NuxtLink :to="`/classes/${e.classId}`">{{ e.gradeName }} {{ e.className }}</NuxtLink></td>
                      <td>{{ enrollmentStatusLabel(e.status) }}</td>
                      <td class="text-nowrap">{{ formatDateKm(e.enrolledOn) }}{{ e.leftOn ? ` → ${formatDateKm(e.leftOn)}` : '' }}</td>
                      <td>{{ e.endReason ?? '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- keyed on the history, so a transfer or promotion reloads them -->
          <StudentAttendanceCard :key="`a-${detail.enrollments.map((e) => `${e.enrollmentId}${e.status}`).join()}`" :student-id="id" :enrollments="detail.enrollments" :years="years" />
          <StudentResultsCard :key="`r-${detail.enrollments.map((e) => `${e.enrollmentId}${e.status}`).join()}`" :student-id="id" />
          <StudentHomeworkCard :key="`h-${detail.enrollments.map((e) => `${e.enrollmentId}${e.status}`).join()}`" :student-id="id" />
          <StudentTimetableCard :key="`t-${detail.enrollments.map((e) => `${e.enrollmentId}${e.status}`).join()}`" :student-id="id" :student-name="student?.nameKm ?? ''" />
        </template>
      </template>
    </StateBlock>

    <StudentMoveModal v-model="showMove" :mode="moveMode" :student-id="id" :enrollment-id="active?.enrollmentId ?? null" :classes="moveClasses" @done="load" />
    <ConfirmModal
      v-model="statusConfirmOpen"
      :title="t(`students.statusConfirm.${confirmStatus ?? 'INACTIVE'}Title`)"
      :message="t(`students.statusConfirm.${confirmStatus ?? 'INACTIVE'}Message`, { name: student?.nameKm ?? '' })"
      :confirm-label="t(confirmStatus === 'GRADUATED' ? 'students.markGraduated' : 'students.markInactive')"
      variant="primary"
      :loading="busy"
      @confirm="confirmStatus && changeStatus(confirmStatus)"
    />
    <ConfirmModal
      v-model="confirmDelete"
      :title="t('students.deleteTitle')"
      :message="t('students.deleteMessage', { name: student?.nameKm ?? '' })"
      :confirm-label="t('common.delete')"
      :loading="busy"
      @confirm="remove"
    />
  </div>
</template>
