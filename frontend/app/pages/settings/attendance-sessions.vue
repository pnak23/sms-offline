<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('attendancePeriods.title')" :subtitle="t('attendancePeriods.subtitle')" />
    <DraftNotice item="attendance-sessions" text-key="acceptance.draft.attendanceSessions" />
    <div class="card">
      <div class="card-body"><PeriodManager /></div>
    </div>
    <OfficialBasisCard />
  </div>
</template>
