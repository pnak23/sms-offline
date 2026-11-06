<script setup lang="ts">
import type { TimetableGrid, TimetableLesson } from '~/types/api';
import { lessonAt, slotTimes, sortedDays, visibleSlots } from '~/utils/timetable';

// One week as a table: the school's days across, its time slots down, a break as one shaded band. `class` shows each lesson's subject and teacher, `teacher` its subject
// and class. With `editable` an empty cell is a button that asks for a lesson and a filled one asks to change it. The table sits in its own scrolling frame, so a week with
// Saturday and Sunday on a small screen scrolls inside the frame and never moves the page. Nothing here knows a real time or day: they all come from the school's settings.
const props = defineProps<{
  grid: TimetableGrid;
  mode: 'class' | 'teacher';
  editable?: boolean;
  /** Show every slot, also the ones this person never uses (an editor needs them; a reader does not). */
  showAll?: boolean;
}>();
const emit = defineEmits<{ cell: [day: number, slotId: number, lesson: TimetableLesson | null] }>();

const { t } = useI18n();
const days = computed(() => sortedDays(props.grid.days));
const slots = computed(() => visibleSlots(props.grid.slots, props.grid.lessons, props.showAll || props.grid.lessons.length === 0 ? 'all' : 'used'));
const who = (lesson: TimetableLesson): string => (props.mode === 'class' ? lesson.teacherName : `${lesson.gradeName} ${lesson.className}`);
</script>

<template>
  <div class="tt-frame" data-testid="tt-grid" :style="{ '--tt-days': days.length }">
    <table class="tt-grid">
      <thead>
        <tr>
          <th class="tt-time" scope="col">{{ t('timetable.time') }}</th>
          <th v-for="d in days" :key="d" scope="col" :data-day="d">{{ t(`timetable.day.${d}`) }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="s in slots" :key="s.id">
          <tr v-if="s.breakSlot" class="tt-break-row" data-testid="tt-break-row" :data-slot="s.id">
            <th class="tt-time" scope="row">
              <span class="tt-times">{{ slotTimes(s) }}</span>
              <span class="tt-name">{{ s.nameKm }}</span>
            </th>
            <td :colspan="days.length" class="tt-break-cell">{{ s.nameKm }}</td>
          </tr>
          <tr v-else :data-slot="s.id" data-testid="tt-row">
            <th class="tt-time" scope="row">
              <span class="tt-times">{{ slotTimes(s) }}</span>
              <span class="tt-name">{{ s.nameKm }}</span>
            </th>
            <td v-for="d in days" :key="d" class="tt-cell" :data-cell="`${d}-${s.id}`" :data-state="lessonAt(grid.lessons, d, s.id) ? 'filled' : 'empty'">
              <template v-for="lesson in [lessonAt(grid.lessons, d, s.id)]" :key="lesson?.id ?? 'none'">
                <button
                  v-if="editable"
                  type="button"
                  class="tt-cell-button"
                  :data-testid="`tt-cell-${d}-${s.id}`"
                  :aria-label="lesson ? t('timetable.changeLesson', { day: t(`timetable.day.${d}`), slot: s.nameKm }) : t('timetable.addLesson', { day: t(`timetable.day.${d}`), slot: s.nameKm })"
                  @click="emit('cell', d, s.id, lesson)"
                >
                  <template v-if="lesson">
                    <span class="tt-subject">{{ lesson.subjectName }}</span>
                    <span class="tt-who">{{ who(lesson) }}</span>
                    <span v-if="mode === 'class' && !lesson.teacherActive" class="badge text-bg-warning tt-inactive" data-testid="tt-teacher-inactive">{{ t('timetable.teacherInactive') }}</span>
                  </template>
                  <AppIcon v-else name="plus-lg" class="tt-plus" />
                </button>
                <div v-else-if="lesson" class="tt-cell-static" :data-testid="`tt-cell-${d}-${s.id}`">
                  <span class="tt-subject">{{ lesson.subjectName }}</span>
                  <span class="tt-who">{{ who(lesson) }}</span>
                  <span v-if="mode === 'class' && !lesson.teacherActive" class="badge text-bg-warning tt-inactive">{{ t('timetable.teacherInactive') }}</span>
                </div>
              </template>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
