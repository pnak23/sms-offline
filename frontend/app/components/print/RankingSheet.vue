<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';
import { useSchoolStore } from '~/stores/school';
import { dividerSvg } from '~/utils/honorArt';
import { NATIONAL_HEADER_FALLBACK, expandHonorText } from '~/utils/honorRoll';
import {
  bandClass, rankingFormatStyle, rankingStats, rankingTokenValues, type RankingOptions, type RankingRow, type RankingTextKey,
} from '~/utils/monthlyRanking';
import { formatNumber } from '~/utils/score';

// The monthly ranking list (ភាពចំណាត់ថ្នាក់ប្រចាំខែ) of ONE class: the national header, the school block, the title, the table of every student (total score, average,
// rank, grade; the row takes the colour of its grade), the figures below it and the two signatures. The sheet flows like a document: a class too big for one page
// continues on the next one with the table's heading repeated. Every text is one of the school's own (options.header / title / stats / dateLines / titleRight /
// titleLeft) with the words in braces filled in for THIS class and the chosen date; the column headings are the school's too.
const props = defineProps<{
  rows: RankingRow[];
  options: RankingOptions;
  /** "ថ្នាក់ទី ១ ក" */
  classLabel: string;
  teacherName: string | null;
  classId: number;
  /** The examination's name, for {exam}. */
  examName: string;
  /** The academic year's name ("2025-2026"), for {schoolYear}. */
  schoolYear: string;
}>();

const { t } = useI18n();
const school = useSchoolStore();
const preferences = usePreferencesStore();

const nationalLines = computed(() => (preferences.headerLines.length > 0 ? preferences.headerLines : [...NATIONAL_HEADER_FALLBACK]));
const divider = dividerSvg('mono');
const stats = computed(() => rankingStats(props.rows));
const tokens = computed(() => rankingTokenValues(props.options.date, { school: school.name, classLabel: props.classLabel, exam: props.examName, schoolYear: props.schoolYear }, stats.value));
const text = (key: RankingTextKey): string => expandHonorText(props.options[key], tokens.value);
const styleOf = (key: RankingTextKey): Record<string, string> => rankingFormatStyle(key, props.options.formats[key]);
const fitOf = (key: RankingTextKey): true | undefined => (props.options.formats[key].fit ? true : undefined);
const columns = computed(() => props.options.columns);
const sexMark = (row: RankingRow): string => (row.gender === 'FEMALE' ? columns.value.female : columns.value.male);

// a "keep each line on one line" box shrinks (never below half) when its longest line is wider than its room
const sheet = ref<HTMLElement | null>(null);
async function fit(): Promise<void> {
  await nextTick();
  for (const el of Array.from(sheet.value?.querySelectorAll<HTMLElement>('[data-fit]') ?? [])) {
    el.style.removeProperty('--fit');
    if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) el.style.setProperty('--fit', String(Math.max(0.5, el.clientWidth / el.scrollWidth)));
  }
}
watch(() => [props.rows, props.options, props.classLabel, props.examName, props.schoolYear], () => void fit(), { deep: true, flush: 'post' });
onMounted(async () => {
  await fit();
  await document.fonts?.ready;
  await fit();
});
</script>

<template>
  <article ref="sheet" class="print-sheet ranking-sheet" :class="{ 'ranking-plain': !options.colours }" lang="km" :data-class="classId" :data-rows="rows.length">
    <header class="ranking-head">
      <div class="ranking-national" data-testid="ranking-national">
        <p v-for="(line, index) in nationalLines" :key="index" :class="index === 0 ? 'ranking-national-main' : index === 1 ? 'ranking-national-sub' : 'ranking-national-extra'">{{ line }}</p>
      </div>
      <div class="ranking-divider" aria-hidden="true" v-html="divider" />
    </header>

    <div v-if="text('header')" class="ranking-school">
      <p data-testid="ranking-header" :style="styleOf('header')" :data-fit="fitOf('header')">{{ text('header') }}</p>
    </div>
    <p v-if="text('title')" class="ranking-title" data-testid="ranking-title" :style="styleOf('title')" :data-fit="fitOf('title')">{{ text('title') }}</p>

    <table class="ranking-table" data-testid="ranking-table">
      <colgroup>
        <col style="width: 6%" /><col style="width: 23%" /><col style="width: 6%" /><col style="width: 11%" /><col style="width: 11%" /><col style="width: 12%" /><col style="width: 11%" /><col style="width: 5%" /><col style="width: 15%" />
      </colgroup>
      <thead>
        <tr>
          <th>{{ columns.no }}</th>
          <th>{{ columns.name }}</th>
          <th>{{ columns.gender }}</th>
          <th>{{ columns.total }}</th>
          <th>{{ columns.average }}</th>
          <th>{{ columns.rank }}</th>
          <th colspan="2">{{ columns.grade }}</th>
          <th>{{ columns.remarks }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.studentId" :class="bandClass(row.bandLetter)" data-testid="ranking-row" :data-no="row.no" :data-rank="row.rank ?? ''">
          <td>{{ row.no }}</td>
          <td class="ranking-name">{{ row.nameKm }}</td>
          <td>{{ sexMark(row) }}</td>
          <td>{{ formatNumber(row.total) }}</td>
          <td>{{ formatNumber(row.average) }}</td>
          <td>{{ row.rank ?? '' }}</td>
          <td>{{ row.bandLabel ?? '' }}</td>
          <td>{{ row.bandLetter ?? '' }}</td>
          <td class="ranking-remarks">{{ row.complete ? '' : t('ranking.incomplete') }}</td>
        </tr>
      </tbody>
    </table>

    <footer class="ranking-foot">
      <p v-if="text('stats')" class="ranking-foot-stats" data-testid="ranking-stats" :style="styleOf('stats')" :data-fit="fitOf('stats')">{{ text('stats') }}</p>
      <p v-if="text('dateLines')" class="ranking-foot-date" data-testid="ranking-date" :style="styleOf('dateLines')" :data-fit="fitOf('dateLines')">{{ text('dateLines') }}</p>
      <p v-if="text('titleLeft')" class="ranking-foot-title-left" data-testid="ranking-title-left" :style="styleOf('titleLeft')" :data-fit="fitOf('titleLeft')">{{ text('titleLeft') }}</p>
      <p v-if="text('titleRight')" class="ranking-foot-title-right" data-testid="ranking-title-right" :style="styleOf('titleRight')" :data-fit="fitOf('titleRight')">{{ text('titleRight') }}</p>
      <p class="ranking-foot-name-left" data-testid="ranking-director">{{ school.profile?.directorName ?? '' }}</p>
      <p class="ranking-foot-name-right" data-testid="ranking-teacher">{{ teacherName ?? '' }}</p>
    </footer>
  </article>
</template>
