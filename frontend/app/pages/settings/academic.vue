<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('academic.title')" :subtitle="t('academic.subtitle')" />
    <div class="card">
      <div class="card-body"><AcademicSetup /></div>
    </div>
  </div>
</template>
