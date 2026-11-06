// Paging a long list: the page arithmetic, the numbered buttons, and the page-size choice that is kept in memory only.
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePagerChoiceStore } from '../app/stores/pagerChoice';
import { ALL_ON_ONE_PAGE, DATA_PAGE_DEFAULT, DATA_PAGE_SIZES, PAGE_SIZES, clampPage, pageButtons, pageCountOf, pageOfIndex, pageRange, pageSlice } from '../app/utils/pagination';

describe('pageCountOf', () => {
  it('rounds up, and an empty list or "all" is one page', () => {
    expect(pageCountOf(15, 5)).toBe(3);
    expect(pageCountOf(16, 5)).toBe(4);
    expect(pageCountOf(5, 5)).toBe(1);
    expect(pageCountOf(1, 5)).toBe(1);
    expect(pageCountOf(0, 5)).toBe(1);
    expect(pageCountOf(100, ALL_ON_ONE_PAGE)).toBe(1);
  });
});

describe('clampPage', () => {
  it('keeps a page between 1 and the last page, and anything that is not a number becomes 1', () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(-4, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(Number.NaN, 3)).toBe(1);
    expect(clampPage(2.9, 5)).toBe(2);
    expect(clampPage(1, 0)).toBe(1);
  });
});

describe('pageRange and pageSlice', () => {
  const items = Array.from({ length: 12 }, (_, i) => i + 1);

  it('says which items a page shows, counted from 1', () => {
    expect(pageRange(12, 1, 5)).toEqual({ from: 1, to: 5 });
    expect(pageRange(12, 2, 5)).toEqual({ from: 6, to: 10 });
    expect(pageRange(12, 3, 5)).toEqual({ from: 11, to: 12 });
    expect(pageRange(12, 1, ALL_ON_ONE_PAGE)).toEqual({ from: 1, to: 12 });
    expect(pageRange(0, 1, 5)).toEqual({ from: 0, to: 0 });
  });

  it('cuts the list into pages that together are the whole list, in order, nothing twice', () => {
    const pages = [1, 2, 3].map((p) => pageSlice(items, p, 5));
    expect(pages).toEqual([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]);
    expect(pages.flat()).toEqual(items);
  });

  it('shows the last page for a page number that is too big, the whole list for "all", and nothing for an empty list', () => {
    expect(pageSlice(items, 99, 5)).toEqual([11, 12]);
    expect(pageSlice(items, 2, ALL_ON_ONE_PAGE)).toEqual(items);
    expect(pageSlice([], 1, 5)).toEqual([]);
  });
});

describe('pageOfIndex', () => {
  it('finds the page of an item (so a subject that was just added is shown)', () => {
    expect(pageOfIndex(0, 5)).toBe(1);
    expect(pageOfIndex(4, 5)).toBe(1);
    expect(pageOfIndex(5, 5)).toBe(2);
    expect(pageOfIndex(14, 5)).toBe(3);
    expect(pageOfIndex(14, ALL_ON_ONE_PAGE)).toBe(1);
    expect(pageOfIndex(-1, 5)).toBe(1);
  });
});

describe('pageButtons', () => {
  it('draws every page when there are seven or fewer', () => {
    expect(pageButtons(1, 1)).toEqual([1]);
    expect(pageButtons(2, 4)).toEqual([1, 2, 3, 4]);
    expect(pageButtons(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the first and last page and the neighbours of the current one, with gaps, never more than seven buttons', () => {
    expect(pageButtons(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(pageButtons(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(pageButtons(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
    expect(pageButtons(17, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    expect(pageButtons(20, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    for (let current = 1; current <= 30; current++) {
      const buttons = pageButtons(current, 30);
      expect(buttons.length).toBeLessThanOrEqual(7);
      expect(buttons).toContain(current);
      expect(buttons[0]).toBe(1);
      expect(buttons.at(-1)).toBe(30);
    }
  });
});

describe('the page-size choice', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts at the fallback, remembers a choice per list, and keeps the lists apart', () => {
    const choice = usePagerChoiceStore();
    expect(choice.sizeFor('subjects', 5)).toBe(5);
    choice.remember('subjects', 20);
    choice.remember('grade-subjects', ALL_ON_ONE_PAGE);
    expect(choice.sizeFor('subjects', 5)).toBe(20);
    expect(choice.sizeFor('grade-subjects', 5)).toBe(ALL_ON_ONE_PAGE);
    expect(choice.sizeFor('another', 10)).toBe(10);
  });

  it('offers the sizes 5, 10 and 20 (and "all")', () => {
    expect(PAGE_SIZES).toEqual([5, 10, 20]);
  });

  it('gives the long data lists (students, teachers, classes) the sizes 10, 20, 50 and 100, starting at 10, which is one of them', () => {
    expect(DATA_PAGE_SIZES).toEqual([10, 20, 50, 100]);
    expect(DATA_PAGE_SIZES).toContain(DATA_PAGE_DEFAULT);
    expect(DATA_PAGE_DEFAULT).toBe(10);
    expect(pageCountOf(1000, DATA_PAGE_DEFAULT)).toBe(100);
    expect(pageRange(72, 8, DATA_PAGE_DEFAULT)).toEqual({ from: 71, to: 72 });
    expect(pageRange(72, 4, 20)).toEqual({ from: 61, to: 72 });
  });
});
