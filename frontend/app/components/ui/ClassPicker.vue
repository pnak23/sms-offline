<script setup lang="ts">
import type { AcademicYear, ClassDto } from '~/types/api';

// The academic year and class selects (see useClassPicker). Two roots, so they sit inside the page's own `.filter-bar`.
const yearId = defineModel<number | null>('yearId', { required: true });
const classId = defineModel<number | null>('classId', { required: true });
defineProps<{
  years: AcademicYear[];
  classes: ClassDto[];
  /** Adds an "all classes" choice (the class may stay empty). */
  allowAll?: boolean;
}>();

const { t } = useI18n();
const uid = useId();
</script>

<template>
  <div>
    <label :for="`picker-year-${uid}`" class="visually-hidden">{{ t('classes.year') }}</label>
    <select :id="`picker-year-${uid}`" v-model="yearId" class="form-select">
      <option v-for="y in years" :key="y.id" :value="y.id">{{ y.nameKm }}{{ y.current ? ` (${t('academic.year.current')})` : '' }}</option>
    </select>
  </div>
  <div>
    <label :for="`picker-class-${uid}`" class="visually-hidden">{{ t('classes.title') }}</label>
    <select :id="`picker-class-${uid}`" v-model="classId" class="form-select">
      <option v-if="allowAll" :value="null">{{ t('classes.allClasses') }}</option>
      <option v-else-if="classes.length === 0" :value="null">{{ t('classes.noneInYear') }}</option>
      <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.gradeName }} {{ c.nameKm }}</option>
    </select>
  </div>
</template>
