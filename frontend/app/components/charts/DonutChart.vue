<script setup lang="ts">
import { donutPaths, nextIndex } from '~/utils/charts';
import type { Slice } from '~/utils/dashboardCharts';

// A donut with the total (or any short text) in the middle and a legend of buttons: a tap, a hover or the arrow keys choose a slice and its sentence is shown and read out.
// A slice with no value is not drawn but stays in the legend, so the totals can always be read.
const props = defineProps<{
  slices: Slice[];
  centerValue: string;
  centerLabel: string;
  label: string;
  animate?: boolean;
}>();

const active = ref(0);
const buttons = ref<HTMLElement[]>([]);
const paths = computed(() => donutPaths(props.slices.map((s) => s.value), 60, 60, 54, 35));
const total = computed(() => props.slices.reduce((a, s) => a + s.value, 0));

function onKey(event: KeyboardEvent): void {
  const next = nextIndex(event.key, active.value, props.slices.length);
  if (next === null) return;
  event.preventDefault();
  active.value = next;
  nextTick(() => buttons.value[next]?.focus());
}
</script>

<template>
  <div class="donut" :class="{ 'chart-animate': animate }" data-testid="donut">
    <div class="donut-figure">
      <svg viewBox="0 0 120 120" role="img" :aria-label="label" focusable="false">
        <circle v-if="total === 0" cx="60" cy="60" r="44.5" class="donut-empty" />
        <template v-for="(slice, i) in slices" :key="slice.key">
          <path v-if="paths[i]" :d="paths[i] as string" :fill="slice.color" fill-rule="evenodd" class="donut-slice" :class="{ 'is-active': i === active }" @mouseenter="active = i" @click="active = i" />
        </template>
      </svg>
      <div class="donut-center"><strong data-testid="donut-total">{{ centerValue }}</strong><span>{{ centerLabel }}</span></div>
    </div>
    <div class="donut-legend" role="group" :aria-label="label" @keydown="onKey">
      <button
        v-for="(slice, i) in slices"
        :key="slice.key"
        :ref="(el) => { if (el) buttons[i] = el as HTMLElement; }"
        type="button"
        class="donut-key"
        :class="{ 'is-active': i === active }"
        :tabindex="i === active ? 0 : -1"
        :aria-label="slice.details"
        data-testid="donut-key"
        :data-key="slice.key"
        @click="active = i"
        @focus="active = i"
        @mouseenter="active = i"
      >
        <span class="donut-swatch" :style="{ background: slice.color }" aria-hidden="true" />
        <span class="donut-key-label">{{ slice.label }}</span>
        <strong class="donut-key-value">{{ slice.value }}</strong>
      </button>
      <p class="chart-details" aria-live="polite" data-testid="chart-details">{{ slices[active]?.details ?? '' }}</p>
    </div>
  </div>
</template>
