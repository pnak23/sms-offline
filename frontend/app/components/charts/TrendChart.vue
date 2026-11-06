<script setup lang="ts">
import { areaPath, linePath, nextIndex, runs } from '~/utils/charts';
import type { TrendPoint } from '~/utils/dashboardCharts';

// A percentage line over days (0 to 100). A day with no record is a GAP: the line breaks there and a dashed tick marks the day, it is never drawn as zero. The whole chart is one tab
// stop: the arrow keys, Home and End (or a tap or a hover on a day) choose a day and its sentence is shown and read out below.
const props = defineProps<{
  points: TrendPoint[];
  label: string;
  animate?: boolean;
}>();

const WIDTH = 640;
const HEIGHT = 240;
const LEFT = 40;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 34;
const innerW = WIDTH - LEFT - RIGHT;
const innerH = HEIGHT - TOP - BOTTOM;

const active = ref(Math.max(0, props.points.length - 1));
watch(() => props.points.length, (n) => {
  active.value = Math.max(0, n - 1);
});

const values = computed(() => props.points.map((p) => p.value));
const x = (i: number): number => (props.points.length <= 1 ? LEFT + innerW / 2 : LEFT + (i * innerW) / (props.points.length - 1));
const y = (v: number): number => TOP + innerH * (1 - Math.min(100, Math.max(0, v)) / 100);
const segments = computed(() => runs(values.value));
const lines = computed(() => segments.value.map((r) => linePath(r, values.value, x, y)).filter(Boolean));
const areas = computed(() => segments.value.map((r) => areaPath(r, values.value, x, y, TOP + innerH)).filter(Boolean));
const dots = computed(() => props.points.map((p, i) => ({ i, p })).filter(({ p }) => p.value !== null));
const gaps = computed(() => props.points.map((p, i) => ({ i, p })).filter(({ p }) => !p.recorded));
const labelEvery = computed(() => Math.max(1, Math.ceil(props.points.length / 9)));
const hatchId = `trend-hatch-${String(useId()).replace(/[^a-zA-Z0-9_-]/g, '')}`;   // unique per chart, like the gradient ids of the roll of honour
const gapWidth = computed(() => Math.min(22, (props.points.length <= 1 ? innerW : innerW / (props.points.length - 1)) * 0.7));

function onKey(event: KeyboardEvent): void {
  const next = nextIndex(event.key, active.value, props.points.length);
  if (next === null) return;
  event.preventDefault();
  active.value = next;
}
</script>

<template>
  <div class="trend" :class="{ 'chart-animate': animate }" data-testid="trend">
    <div class="trend-frame" tabindex="0" role="group" :aria-label="label" data-testid="trend-frame" @keydown="onKey">
      <svg :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <g class="trend-grid">
          <template v-for="tick in [0, 25, 50, 75, 100]" :key="tick">
            <line :x1="LEFT" :x2="WIDTH - RIGHT" :y1="y(tick)" :y2="y(tick)" />
            <text :x="LEFT - 6" :y="y(tick) + 4" text-anchor="end">{{ tick }}%</text>
          </template>
        </g>
        <path v-for="(d, k) in areas" :key="`a${k}`" :d="d" class="trend-area" />
        <path v-for="(d, k) in lines" :key="`l${k}`" :d="d" class="trend-line" pathLength="1" />
        <defs>
          <pattern :id="hatchId" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="trend-hatch" /></pattern>
        </defs>
        <!-- a day with no record: a hatched band over the whole height of the plot and a dashed line, and NOTHING on the 0% line (a mark down there would read as "zero") -->
        <g v-for="{ i } in gaps" :key="`g${i}`" class="trend-gap" data-testid="trend-gap">
          <rect :x="x(i) - gapWidth / 2" :y="TOP" :width="gapWidth" :height="innerH" :fill="`url(#${hatchId})`" />
          <line :x1="x(i)" :x2="x(i)" :y1="TOP" :y2="TOP + innerH" />
        </g>
        <circle v-for="{ i, p } in dots" :key="`d${i}`" :cx="x(i)" :cy="y(p.value as number)" :r="i === active ? 6 : 3.5" class="trend-dot" :class="{ 'is-active': i === active }" />
        <line v-if="points[active]" :x1="x(active)" :x2="x(active)" :y1="TOP" :y2="TOP + innerH" class="trend-guide" />
        <g class="trend-axis">
          <text v-for="(p, i) in points" v-show="i % labelEvery === 0 || i === points.length - 1" :key="`x${i}`" :x="x(i)" :y="HEIGHT - 10" text-anchor="middle">{{ p.label }}</text>
        </g>
        <rect v-for="(p, i) in points" :key="`h${i}`" class="trend-hit" :x="x(i) - innerW / Math.max(1, points.length - 1) / 2" :y="TOP" :width="innerW / Math.max(1, points.length - 1)" :height="innerH" data-testid="trend-hit" @mouseenter="active = i" @click="active = i" />
      </svg>
    </div>
    <p class="chart-details" aria-live="polite" data-testid="chart-details">{{ points[active]?.details ?? '' }}</p>
  </div>
</template>
