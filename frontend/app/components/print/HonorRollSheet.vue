<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';
import { useSchoolStore } from '~/stores/school';
import { dividerSvg, honorLook, pageSvg, plateSvg, type HonorStyleId } from '~/utils/honorArt';
import { NATIONAL_HEADER_FALLBACK, expandHonorText, honorFormatStyle, honorLayout, honorTokenValues, type HonorOptions, type HonorRoll, type HonorTextKey } from '~/utils/honorRoll';

// One roll of honour (តារាងកិត្តិយស), one A4 page, for one class. The artwork (page border, corners, the frame around each name, the flourish under
// the header) is drawn by utils/honorArt.ts in the chosen style; the page is laid out with CSS, not fixed positions, so a line that is left out
// (a text box the school emptied) simply gives its room back; the national header is never left out. Every other word on the page is one of the school's
// five texts (options.header / subtitle / dateLines / titleRight / titleLeft), with the words in braces filled in for THIS page: the class, the examination
// and the date that was chosen. The frames shrink to fit the room that is left, and a long name
// shrinks to fit its frame, so the page never runs onto a second sheet.
const props = defineProps<{
  roll: HonorRoll;
  artStyle: HonorStyleId;
  options: HonorOptions;
  /** "ថ្នាក់ទី ១ ក" */
  classLabel: string;
  teacherName: string | null;
  classId: number;
  /** The examination's name, for {exam}. */
  examName: string;
}>();

const { t } = useI18n();
const school = useSchoolStore();
const preferences = usePreferencesStore();

const look = computed(() => honorLook(props.artStyle));
/** Always printed (see NATIONAL_HEADER_FALLBACK): the school's own lines from Settings → Printed reports, or the standard two. */
const nationalLines = computed(() => (preferences.headerLines.length > 0 ? preferences.headerLines : [...NATIONAL_HEADER_FALLBACK]));
const pageArt = computed(() => pageSvg(props.artStyle, 680, 1001));   // the printable area: 180 mm x 265 mm at 96 dpi
const divider = computed(() => dividerSvg(props.artStyle));
const plate = computed(() => plateSvg(props.artStyle));
const rows = computed(() => honorLayout(props.roll.entries));
const nameBox = computed(() => {
  const { cy, w } = look.value.nameBox;
  return { left: `${((160 - w / 2) / 320) * 100}%`, width: `${(w / 320) * 100}%`, top: `${(cy / 120) * 100}%` };
});

const tokens = computed(() => honorTokenValues(props.options.date, { school: school.name, classLabel: props.classLabel, exam: props.examName }));
const headerText = computed(() => expandHonorText(props.options.header, tokens.value));
const subtitleText = computed(() => expandHonorText(props.options.subtitle, tokens.value));
const dateLinesText = computed(() => expandHonorText(props.options.dateLines, tokens.value));
const titleRightText = computed(() => expandHonorText(props.options.titleRight, tokens.value));
const titleLeftText = computed(() => expandHonorText(props.options.titleLeft, tokens.value));
/** The look the school chose for a box (font, size, bold, italic, underline, alignment); a "stay on one line" box also carries data-fit, see fit(). */
const styleOf = (key: HonorTextKey): Record<string, string> => honorFormatStyle(key, props.options.formats[key]);
const fitOf = (key: HonorTextKey): true | undefined => (props.options.formats[key].fit ? true : undefined);

// A long name shrinks to its frame (never below half size; below that it is allowed to wrap onto two lines).
const sheet = ref<HTMLElement | null>(null);
async function fit(): Promise<void> {
  await nextTick();
  const root = sheet.value;
  if (!root) return;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-fit]'))) {
    el.style.removeProperty('--fit');
    if (el.scrollWidth > el.clientWidth && el.clientWidth > 0) el.style.setProperty('--fit', String(Math.max(0.5, el.clientWidth / el.scrollWidth)));
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('.honor-name'))) {
    el.style.removeProperty('--fit');
    el.removeAttribute('data-wrap');
    const text = el.firstElementChild as HTMLElement | null;
    if (!text) continue;
    const room = el.clientWidth;
    const need = text.scrollWidth;
    if (need > room && room > 0) {
      const scale = Math.max(0.5, room / need);
      el.style.setProperty('--fit', String(scale));
      if (room / need < 0.5) el.setAttribute('data-wrap', 'true');
    }
  }
}

let observer: ResizeObserver | null = null;
watch(() => [props.roll, props.artStyle, props.options, props.classLabel, props.examName], () => void fit(), { deep: true, flush: 'post' });
onMounted(async () => {
  await fit();
  await document.fonts?.ready;   // the Khmer font changes every width once it arrives
  await fit();
  const grid = sheet.value?.querySelector('.honor-rows');
  if (grid && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => void fit());
    observer.observe(grid);
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <article ref="sheet" class="print-sheet honor-sheet" lang="km" :data-class="classId" :data-style="artStyle" :data-names="roll.entries.length">
    <div class="honor-page" :style="{ color: look.text }">
      <!-- the artwork is built from constants in utils/honorArt.ts only, never from anything typed -->
      <div class="honor-art" aria-hidden="true" v-html="pageArt" />
      <div class="honor-content">
        <header class="honor-head">
          <div class="honor-national" data-testid="honor-national">
            <p v-for="(line, index) in nationalLines" :key="index" :class="index === 0 ? 'honor-national-main' : index === 1 ? 'honor-national-sub' : 'honor-national-extra'">{{ line }}</p>
          </div>
          <div class="honor-divider" aria-hidden="true" v-html="divider" />
        </header>

        <div class="honor-top">
          <div class="honor-school" data-testid="honor-school">
            <p v-if="headerText" data-testid="honor-header" :style="styleOf('header')" :data-fit="fitOf('header')">{{ headerText }}</p>
          </div>
          <div class="honor-titles">
            <h1 class="honor-title" :style="{ color: look.title }">{{ t('honor.title') }}</h1>
            <p v-if="subtitleText" class="honor-subtitle" data-testid="honor-subtitle" :style="styleOf('subtitle')" :data-fit="fitOf('subtitle')">{{ subtitleText }}</p>
          </div>
          <div />
        </div>

        <div class="honor-rows" data-testid="honor-rows">
          <div class="honor-grid" :style="{ '--rows': rows.length }" :data-count="roll.count">
            <div v-for="(row, r) in rows" :key="r" class="honor-row">
              <div v-for="entry in row" :key="entry.studentId" class="honor-plate" data-testid="honor-plate" :data-rank="entry.rank">
                <div class="honor-plate-art" aria-hidden="true" v-html="plate" />
                <div class="honor-name" :style="{ ...nameBox, color: look.nameColor }" data-testid="honor-name">
                  <span class="honor-name-text">{{ entry.rank }}. {{ entry.nameKm }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-if="roll.extra > 0" class="honor-tie-note" data-testid="honor-tie-note">{{ t('honor.tieNote', { count: roll.count }) }}</p>

        <footer class="honor-foot">
          <p v-if="dateLinesText" class="honor-foot-right honor-foot-date" data-testid="honor-date" :style="styleOf('dateLines')" :data-fit="fitOf('dateLines')">{{ dateLinesText }}</p>
          <p v-if="titleLeftText" class="honor-foot-left honor-foot-title" data-testid="honor-title-left" :style="styleOf('titleLeft')" :data-fit="fitOf('titleLeft')">{{ titleLeftText }}</p>
          <p v-if="titleRightText" class="honor-foot-right honor-foot-title" data-testid="honor-title-right" :style="styleOf('titleRight')" :data-fit="fitOf('titleRight')">{{ titleRightText }}</p>
          <p class="honor-foot-left honor-foot-name" data-testid="honor-director">{{ school.profile?.directorName ?? '' }}</p>
          <p class="honor-foot-right honor-foot-name" data-testid="honor-teacher">{{ teacherName ?? '' }}</p>
        </footer>
      </div>
    </div>
  </article>
</template>
