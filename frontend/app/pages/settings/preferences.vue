<script setup lang="ts">
const { t } = useI18n();
const notify = useNotify();
</script>

<template>
  <div class="page-container is-form">
    <PageHeader :title="t('settings.preferences.title')" :subtitle="t('settings.preferences.subtitle')" />
    <div class="card">
      <div class="card-body"><StepPreferences standalone @saved="notify.success(t('settings.preferences.saved'))" /></div>
    </div>
  </div>
</template>
