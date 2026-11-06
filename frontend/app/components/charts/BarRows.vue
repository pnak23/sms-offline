<script setup lang="ts">
import { nextIndex, share } from '~/utils/charts';
import type { BarRow } from '~/utils/dashboardCharts';

// Horizontal bars, one row per item: a label, a bar drawn in SVG (one or several segments, with an optional mark such as a capacity or the pass mark) and its value. Each row is a
// button: a tap, a hover or the arrow keys choose it and its sentence is shown (and read out) below. One tab stop for the whole chart; Home and End go to the ends.
const props = defineProps<{
  rows: BarRow[];
  /** The value at the right end of the bars. */
  max: number;
  /** The name of the chart for a screen reader. */
  label: string;
  animate?: boolean;
  /** Which row is chosen when the chart appears: the first (the default) or the last (a series of months starts at the newest). */
  start?: 'first' | 'last';
}>();

const active = ref(props.start === 'last' ? Math.max(0, props.rows.length - 1) : 0);
const buttons = ref<HTMLElement[]>([]);

function select(index: number): void {
  active.value = index;
}

function onKey(event: KeyboardEvent): void {
  const next = nextIndex(event.key, active.value, props.rows.length);
  if (next === null) return;
  event.preventDefault();
  active.value = next;
  nextTick(() => buttons.value[next]?.focus());
}

function segments(row: BarRow): { x: number; w: number; color: string }[] {
  let x = 0;
  return row.segments.map((s) => {
    const w = share(s.value, props.max);
    const out = { x, w, color: s.color };
    x += w;
    return out;
  });
}
</script>

<template>
  <div class="bar-rows" :class="{ 'chart-animate': animate }" role="group" :aria-label="label" data-testid="bar-rows" @keydown="onKey">
    <button
      v-for="(row, i) in rows"
      :key="row.key"
      :ref="(el) => { if (el) buttons[i] = el as HTMLElement; }"
      type="button"
      class="bar-row"
      :class="{ 'is-active': i === active }"
      :tabindex="i === active ? 0 : -1"
      :aria-label="row.details"
      data-testid="bar-row"
      :data-key="row.key"
      @click="select(i)"
      @focus="select(i)"
      @mouseenter="select(i)"
    >
      <span class="bar-label">{{ row.label }}</span>
      <svg class="bar-svg" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect class="bar-track" x="0" y="0" width="100" height="14" rx="2" />
        <rect v-for="(s, k) in segments(row)" :key="k" class="bar-seg" :x="s.x" y="0" :width="s.w" height="14" :fill="s.color" />
        <line v-if="row.marker !== null" class="bar-marker" :x1="share(row.marker, max)" :x2="share(row.marker, max)" y1="-1" y2="15" />
      </svg>
      <span class="bar-value">{{ row.valueText }}</span>
    </button>
    <p class="chart-details" aria-live="polite" data-testid="chart-details">{{ rows[active]?.details ?? '' }}</p>
  </div>
</template>
