<script setup lang="ts">
import type { TimetableCopyResult } from '~/types/api';

// What a copy did, or (a preview) what it WOULD do: the lessons that are copied and every lesson that is skipped, each with its reason. The preview changes nothing.
const props = defineProps<{ result: TimetableCopyResult; showClass?: boolean }>();
const { t } = useI18n();

const reasonText = (reason: string, detail: string | null): string => t(`timetable.skip.${reason}`, { detail: detail ?? '' });
const summary = computed(() =>
  t(props.result.preview ? 'timetable.copy.previewSummary' : 'timetable.copy.doneSummary', { copied: props.result.copied.length, skipped: props.result.skipped.length }),
);
</script>

<template>
  <div data-testid="tt-copy-result" :data-preview="result.preview ? 'yes' : 'no'">
    <p class="fw-medium mb-1" data-testid="tt-copy-summary">{{ summary }}</p>
    <p v-if="result.slots > 0" class="mb-1 small" data-testid="tt-copy-slots">{{ t('timetable.copy.slots', { n: result.slots }) }}</p>
    <p v-if="result.replaced > 0" class="mb-1 small text-warning-emphasis" data-testid="tt-copy-replaced">{{ t('timetable.copy.replaced', { n: result.replaced }) }}</p>

    <template v-if="result.copied.length > 0">
      <h4 class="h6 mt-3 mb-1">{{ t('timetable.copy.copiedTitle') }}</h4>
      <div class="tt-list table-responsive" data-testid="tt-copied-list">
        <table class="table table-sm mb-0">
          <thead>
            <tr>
              <th v-if="showClass">{{ t('students.class') }}</th>
              <th>{{ t('timetable.day.label') }}</th>
              <th>{{ t('timetable.time') }}</th>
              <th>{{ t('exams.subject') }}</th>
              <th>{{ t('timetable.cell.teacher') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(c, i) in result.copied" :key="i" data-testid="tt-copied-row">
              <td v-if="showClass" class="text-nowrap">{{ c.gradeName }} {{ c.className }}</td>
              <td class="text-nowrap">{{ t(`timetable.day.${c.dayOfWeek}`) }}</td>
              <td>{{ c.slotName }}</td>
              <td>{{ c.subjectName }}</td>
              <td>{{ c.teacherName }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-if="result.skipped.length > 0">
      <h4 class="h6 mt-3 mb-1">{{ t('timetable.copy.skippedTitle') }}</h4>
      <div class="tt-list table-responsive" data-testid="tt-skipped-list">
        <table class="table table-sm mb-0">
          <thead>
            <tr>
              <th v-if="showClass">{{ t('students.class') }}</th>
              <th>{{ t('timetable.day.label') }}</th>
              <th>{{ t('timetable.time') }}</th>
              <th>{{ t('exams.subject') }}</th>
              <th>{{ t('timetable.copy.reason') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in result.skipped" :key="i" data-testid="tt-skipped-row" :data-reason="s.reason">
              <td v-if="showClass" class="text-nowrap">{{ s.gradeName }} {{ s.className }}</td>
              <td class="text-nowrap">{{ t(`timetable.day.${s.dayOfWeek}`) }}</td>
              <td>{{ s.slotName }}</td>
              <td>{{ s.subjectName }}</td>
              <td>{{ reasonText(s.reason, s.detail) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
