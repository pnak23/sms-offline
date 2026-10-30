<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('security.title')" :subtitle="t('security.subtitle')" />

    <div class="row g-4">
      <div class="col-xl-6">
        <div class="card h-100">
          <div class="card-header"><AppIcon name="lock" class="me-2" />{{ t('security.password.title') }}</div>
          <div class="card-body"><ChangePasswordForm /></div>
        </div>
      </div>
      <div class="col-xl-6">
        <div class="card h-100">
          <div class="card-header"><AppIcon name="key" class="me-2" />{{ t('security.regenerate.title') }}</div>
          <div class="card-body"><RegenerateKeyFlow /></div>
        </div>
      </div>
    </div>
  </div>
</template>
