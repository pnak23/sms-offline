<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import type { AcademicYear, Grade } from '~/types/api';

// Academic year + grades 1-6 (read-only) + subject switches. Used by wizard step 5 and Settings -> Academic.
const emit = defineEmits<{ yearsChanged: [years: AcademicYear[]] }>();

const { t } = useI18n();
const grades = ref<Grade[]>([]);
const gradesError = ref(false);

onMounted(async () => {
  try {
    grades.value = await academicApi.grades();
  } catch {
    gradesError.value = true; // the year and subject sections show their own errors; grades are informational
  }
});
</script>

<template>
  <div>
    <AcademicYearSection @changed="emit('yearsChanged', $event)" />

    <section class="mb-4">
      <h3 class="h5">{{ t('academic.grades.title') }}</h3>
      <p class="text-muted mb-2">{{ t('academic.grades.intro') }}</p>
      <ul class="chip-list" :aria-label="t('academic.grades.title')">
        <li v-for="grade in grades" :key="grade.id" class="chip">{{ grade.nameKm }}</li>
      </ul>
    </section>

    <SubjectChecklist />
  </div>
</template>
