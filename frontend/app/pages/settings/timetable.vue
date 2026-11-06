<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('timetable.settings.title')" :subtitle="t('timetable.settings.subtitle')" />
    <DraftNotice item="timetable-slots" text-key="acceptance.draft.timetableSlots" />
    <div class="card">
      <div class="card-body"><SlotManager /></div>
    </div>
  </div>
</template>
