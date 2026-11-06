<script setup lang="ts">
import { ALL_ON_ONE_PAGE, PAGE_SIZES, pageButtons } from '~/utils/pagination';

// The bar under a long list: "showing 1-5 of 15", the page buttons (first, previous, numbers, next, last) and how many to show per page ("all" is one page).
// It draws nothing while the list is short enough for the smallest page size. The page and the size are the parent's (v-model); `unit` is the word for what is counted.
const page = defineModel<number>('page', { required: true });
const size = defineModel<number>('size', { required: true });
const props = withDefaults(defineProps<{ total: number; pageCount: number; from: number; to: number; unit: string; testId: string; sizes?: readonly number[] }>(), { sizes: () => PAGE_SIZES });

const { t } = useI18n();

const visible = computed(() => props.total > Math.min(...props.sizes));
const buttons = computed(() => pageButtons(page.value, props.pageCount));
const first = computed(() => page.value <= 1);
const last = computed(() => page.value >= props.pageCount);

function onSize(event: Event): void {
  size.value = Number((event.target as HTMLSelectElement).value);
}
</script>

<template>
  <nav v-if="visible" class="list-pager" :aria-label="t('pager.label')" :data-testid="testId">
    <p class="list-pager-info mb-0" data-testid="pager-info">{{ t('pager.showing', { from, to, total, unit }) }}</p>
    <ul class="pagination pagination-sm mb-0">
      <li class="page-item" :class="{ disabled: first }">
        <button type="button" class="page-link" :disabled="first" :aria-label="t('pager.first')" :title="t('pager.first')" data-testid="pager-first" @click="page = 1"><AppIcon name="chevron-double-left" /></button>
      </li>
      <li class="page-item" :class="{ disabled: first }">
        <button type="button" class="page-link" :disabled="first" :aria-label="t('pager.previous')" :title="t('pager.previous')" data-testid="pager-previous" @click="page = page - 1"><AppIcon name="chevron-left" /></button>
      </li>
      <template v-for="(entry, index) in buttons" :key="index">
        <li v-if="entry === 'gap'" class="page-item disabled" aria-hidden="true"><span class="page-link">…</span></li>
        <li v-else class="page-item" :class="{ active: entry === page }">
          <button type="button" class="page-link" :aria-label="t('pager.page', { page: entry })" :aria-current="entry === page ? 'page' : undefined" :data-page="entry" @click="page = entry">{{ entry }}</button>
        </li>
      </template>
      <li class="page-item" :class="{ disabled: last }">
        <button type="button" class="page-link" :disabled="last" :aria-label="t('pager.next')" :title="t('pager.next')" data-testid="pager-next" @click="page = page + 1"><AppIcon name="chevron-right" /></button>
      </li>
      <li class="page-item" :class="{ disabled: last }">
        <button type="button" class="page-link" :disabled="last" :aria-label="t('pager.last')" :title="t('pager.last')" data-testid="pager-last" @click="page = pageCount"><AppIcon name="chevron-double-right" /></button>
      </li>
    </ul>
    <label class="list-pager-size">
      <span>{{ t('pager.perPage') }}</span>
      <select class="form-select form-select-sm" :value="size" data-testid="pager-size" @change="onSize">
        <option v-for="n in sizes" :key="n" :value="n">{{ n }}</option>
        <option :value="ALL_ON_ONE_PAGE">{{ t('pager.all') }}</option>
      </select>
    </label>
  </nav>
</template>
