<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import type { AcademicYear, Grade } from '~/types/api';

// Academic year + grades + subjects. The wizard (step 5) shows the grades as read-only chips and only switches subjects.
// With `manage` (Settings -> Academic) the years are editable, subjects can be added and renamed, and a grade/subject
// table says which subjects each grade studies.
const props = defineProps<{ manage?: boolean }>();
const emit = defineEmits<{ yearsChanged: [years: AcademicYear[]] }>();

const { t } = useI18n();

const grades = ref<Grade[]>([]);
const gradesError = ref(false);
const subjectsVersion = ref(0); // bumped when a subject was added or switched, so the grade/subject table reloads

onMounted(async () => {
  if (props.manage) return; // the grade/subject table loads the grades itself
  try {
    grades.value = await academicApi.grades();
  } catch {
    gradesError.value = true; // the year and subject sections show their own errors; grades are informational
  }
});
</script>

<template>
  <div>
    <AcademicYearSection :manage="manage" @changed="emit('yearsChanged', $event)" />
    <template v-if="manage">
      <div class="mb-4"><SubjectChecklist manage @changed="subjectsVersion++" /></div>
      <section>
        <h3 class="h5">{{ t('academic.grades.matrixTitle') }}</h3>
        <p class="text-muted mb-2">{{ t('academic.grades.matrixIntro') }}</p>
        <GradeSubjectMatrix :refresh-key="subjectsVersion" />
      </section>
    </template>
    <template v-else>
      <section class="mb-4">
        <h3 class="h5">{{ t('academic.grades.title') }}</h3>
        <p class="text-muted mb-2">{{ t('academic.grades.intro') }}</p>
        <ul class="chip-list" :aria-label="t('academic.grades.title')">
          <li v-for="grade in grades" :key="grade.id" class="chip">{{ grade.nameKm }}</li>
        </ul>
      </section>
      <SubjectChecklist />
    </template>
  </div>
</template>
