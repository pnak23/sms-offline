<script setup lang="ts">
import { linePath, runs } from '~/utils/charts';

// A tiny trend for a figure tile. A null is a gap and breaks the line (never a zero); a single value is a dot. Decorative: the figure beside it says the same in words.
const props = defineProps<{ values: (number | null)[]; label: string }>();

const WIDTH = 96;
const HEIGHT = 30;
const x = (i: number): number => (props.values.length <= 1 ? WIDTH / 2 : 3 + (i * (WIDTH - 6)) / (props.values.length - 1));
const y = (v: number): number => 3 + (HEIGHT - 6) * (1 - Math.min(100, Math.max(0, v)) / 100);
const paths = computed(() => runs(props.values).map((r) => ({ run: r, d: linePath(r, props.values, x, y) })));
const last = computed(() => {
  for (let i = props.values.length - 1; i >= 0; i--) if (props.values[i] !== null) return i;
  return -1;
});
</script>

<template>
  <svg class="spark" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" :aria-label="label" focusable="false" data-testid="sparkline">
    <template v-for="(p, k) in paths" :key="k">
      <path v-if="p.d" :d="p.d" class="spark-line" />
      <circle v-else :cx="x(p.run[0] as number)" :cy="y(values[p.run[0] as number] as number)" r="2.5" class="spark-dot" />
    </template>
    <circle v-if="last >= 0" :cx="x(last)" :cy="y(values[last] as number)" r="3" class="spark-end" />
  </svg>
</template>
