import type { Ref } from 'vue';
import { usePagerChoiceStore } from '~/stores/pagerChoice';
import { clampPage, pageCountOf, pageOfIndex, pageRange, pageSlice, PAGE_SIZES } from '~/utils/pagination';

/**
 * Pages a list. `key` names the list, so the page size chosen for it is remembered (in memory) while the program is open. The page number stays put when the
 * list is reloaded (a switch was flipped, a name changed) and moves back into range when the list got shorter. `goToIndex` shows the page of one item, for a
 * subject that was just added.
 */
export function usePagination<T>(items: Readonly<Ref<readonly T[]>>, key: string, options: { fallback?: number } = {}) {
  const choice = usePagerChoiceStore();
  const wanted = ref(1);

  const size = computed({
    get: () => choice.sizeFor(key, options.fallback ?? PAGE_SIZES[0] ?? 5),
    set: (value: number) => {
      choice.remember(key, value);
      wanted.value = 1;
    },
  });
  const total = computed(() => items.value.length);
  const pageCount = computed(() => pageCountOf(total.value, size.value));
  const page = computed({
    get: () => clampPage(wanted.value, pageCount.value),
    set: (value: number) => {
      wanted.value = clampPage(value, pageCount.value);
    },
  });
  const shown = computed(() => pageSlice(items.value, page.value, size.value));
  const range = computed(() => pageRange(total.value, page.value, size.value));

  function goToIndex(index: number): void {
    wanted.value = pageOfIndex(index, size.value);
  }

  /** Back to the first page: a new search or filter starts a new list. */
  function reset(): void {
    wanted.value = 1;
  }

  return { page, size, total, pageCount, shown, range, goToIndex, reset };
}
