<script setup lang="ts">
import type { AttendancePeriod } from '~/types/api';
import { timeRange } from '~/utils/attendance';

// The sessions of the school day as one row of buttons (the screen hides it when the school has only one). A tick marks a session this class
// has already taken today. The times are shown as information; choosing a session is never refused because of the time of day.
defineProps<{ periods: AttendancePeriod[]; recorded: number[] }>();
const selected = defineModel<number | null>({ required: true });

const { t } = useI18n();
</script>

<template>
  <div class="btn-group session-choice" role="group" :aria-label="t('attendance.session')" data-testid="session-choice">
    <template v-for="p in periods" :key="p.id">
      <input :id="`session-${p.id}`" type="radio" class="btn-check" name="attendance-session" :checked="selected === p.id" autocomplete="off" @change="selected = p.id" />
      <label class="btn btn-outline-primary" :for="`session-${p.id}`" :data-session="p.nameKm" :data-recorded="recorded.includes(p.id) ? 'true' : 'false'">
        <template v-if="recorded.includes(p.id)"><AppIcon name="check-lg" /><span class="visually-hidden">{{ t('attendance.sessionRecorded') }}</span></template>
        {{ p.nameKm }}
        <span v-if="timeRange(p.startTime, p.endTime)" class="session-times">{{ timeRange(p.startTime, p.endTime) }}</span>
        <span v-if="!p.enabled" class="session-times">{{ t('attendance.sessionOff') }}</span>
      </label>
    </template>
  </div>
</template>
