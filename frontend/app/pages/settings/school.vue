<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <div class="page-container is-form">
    <PageHeader :title="t('settings.school.title')" :subtitle="t('settings.school.subtitle')" />
    <div class="card">
      <div class="card-body"><SchoolProfileForm /></div>
    </div>
  </div>
</template>
