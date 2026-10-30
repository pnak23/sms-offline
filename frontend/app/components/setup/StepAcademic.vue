<script setup lang="ts">
import { useSetupStore } from '~/stores/setup';
import type { AcademicYear } from '~/types/api';

// Wizard step 5: first academic year and subjects (optional; the dashboard keeps reminding until a year exists).
const emit = defineEmits<{ next: []; back: [] }>();

const { t } = useI18n();
const setup = useSetupStore();
const hasYear = ref(false);

function onNext(): void {
  setup.academicSkipped = !hasYear.value;
  emit('next');
}

function onYears(years: AcademicYear[]): void {
  hasYear.value = years.length > 0;
}
</script>

<template>
  <div>
    <AcademicSetup @years-changed="onYears" />
    <div class="wizard-actions">
      <button type="button" class="btn btn-outline-secondary" @click="emit('back')"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
      <div class="d-flex gap-2">
        <button v-if="!hasYear" type="button" class="btn btn-outline-secondary" @click="onNext">{{ t('common.skipForNow') }}</button>
        <LoadingButton v-if="hasYear" icon="arrow-right" @click="onNext">{{ t('common.next') }}</LoadingButton>
      </div>
    </div>
  </div>
</template>
