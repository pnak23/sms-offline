<script setup lang="ts">
// The shell of a dashboard chart: a title with an icon, a text summary, the figure or (when asked) the same data as a table, and the three states that are not a chart:
// loading (a quiet placeholder), empty (a sentence that says why there is nothing to draw) and failed. Nothing here knows what a chart shows.
const props = defineProps<{
  title: string;
  icon: string;
  testid: string;
  /** One or two sentences that say what the figure shows, for everybody and for a screen reader. */
  summary?: string;
  loading?: boolean;
  empty?: boolean;
  emptyText?: string;
  failed?: string | null;
  /** Offer "show as table" (the same data as a table, for screen readers and for reading figures exactly). */
  hasTable?: boolean;
}>();
defineEmits<{ retry: [] }>();

const { t } = useI18n();
const asTable = ref(false);
const titleId = `chart-${useId()}`;
const showToggle = computed(() => props.hasTable && !props.loading && !props.empty && !props.failed);
</script>

<template>
  <section class="card chart-card" :data-testid="testid" :aria-labelledby="titleId">
    <header class="chart-head">
      <span class="chart-icon" aria-hidden="true"><AppIcon :name="icon" /></span>
      <h2 :id="titleId" class="chart-title">{{ title }}</h2>
      <button v-if="showToggle" type="button" class="btn btn-sm chart-table-toggle" :aria-pressed="asTable" data-testid="chart-table-toggle" @click="asTable = !asTable">
        <AppIcon :name="asTable ? 'bar-chart-line' : 'table'" />{{ asTable ? t('dashboard.charts.showChart') : t('dashboard.charts.showTable') }}
      </button>
    </header>
    <div class="chart-body">
      <div v-if="loading" class="chart-skeleton" data-testid="chart-loading" role="status" :aria-label="t('common.loading')"><span /><span /><span /></div>
      <div v-else-if="failed" class="chart-failed" role="alert" data-testid="chart-failed">
        <span>{{ failed }}</span>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="$emit('retry')">{{ t('common.retry') }}</button>
      </div>
      <p v-else-if="empty" class="chart-empty" data-testid="chart-empty"><AppIcon name="info-circle-fill" class="me-2" />{{ emptyText }}</p>
      <template v-else>
        <p v-if="summary" class="chart-summary" data-testid="chart-summary">{{ summary }}</p>
        <slot v-if="!asTable" />
        <slot v-else name="table" />
        <slot name="footer" />
      </template>
    </div>
  </section>
</template>
