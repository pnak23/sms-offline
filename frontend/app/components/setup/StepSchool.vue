<script setup lang="ts">
import { useSetupStore } from '~/stores/setup';

// Wizard step 4: school profile (optional; the dashboard keeps reminding until a name exists).
const emit = defineEmits<{ next: [] }>();

const { t } = useI18n();
const setup = useSetupStore();

function onSaved(): void {
  setup.schoolSkipped = false;
  emit('next');
}

function onSkip(): void {
  setup.schoolSkipped = true;
  emit('next');
}
</script>

<template>
  <div>
    <p class="text-muted">{{ t('setup.school.intro') }}</p>
    <SchoolProfileForm wizard @saved="onSaved" @skip="onSkip" />
  </div>
</template>
