<script setup lang="ts">
import type { ChartTableData } from '~/utils/dashboardCharts';

// The data of a chart as a plain table: exact figures for everybody, and the form a screen reader reads best.
defineProps<{ caption: string; data: ChartTableData }>();
</script>

<template>
  <div class="table-responsive scroll-x chart-table-wrap">
    <table class="table table-sm align-middle mb-0 chart-table" data-testid="chart-table">
      <caption class="visually-hidden">{{ caption }}</caption>
      <thead>
        <tr><th v-for="(c, i) in data.columns" :key="i" scope="col" :class="{ 'text-end': i > 0 }">{{ c }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in data.rows" :key="r">
          <th scope="row" class="fw-medium">{{ row[0] }}</th>
          <td v-for="(cell, c) in row.slice(1)" :key="c" class="text-end">{{ cell }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
