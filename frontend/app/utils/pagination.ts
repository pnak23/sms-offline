// Paging a long list: how many pages there are, which items a page shows, and which page buttons to draw. Pure arithmetic, so it is tested on its own.
// A page size of 0 means "all on one page" (the list is simply not cut).

export const ALL_ON_ONE_PAGE = 0;
/** The page sizes the pager offers (besides "all"). */
export const PAGE_SIZES: readonly number[] = [5, 10, 20];
/** The page sizes of the long data lists (students, teachers, classes), and the one they start with: 10 rows fit a normal screen without scrolling. */
export const DATA_PAGE_SIZES: readonly number[] = [10, 20, 50, 100];
export const DATA_PAGE_DEFAULT = 10;

export const pageCountOf = (total: number, size: number): number => (size <= 0 || total <= 0 ? 1 : Math.ceil(total / size));

/** A page number kept between 1 and the last page (anything that is not a number becomes 1). */
export const clampPage = (page: number, count: number): number => Math.min(Math.max(Math.trunc(page) || 1, 1), Math.max(count, 1));

/** The first and last item of a page, counted from 1 (both 0 when the list is empty). */
export function pageRange(total: number, page: number, size: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  if (size <= 0) return { from: 1, to: total };
  const current = clampPage(page, pageCountOf(total, size));
  return { from: (current - 1) * size + 1, to: Math.min(current * size, total) };
}

/** The items of one page. */
export function pageSlice<T>(items: readonly T[], page: number, size: number): T[] {
  const { from, to } = pageRange(items.length, page, size);
  return from === 0 ? [] : items.slice(from - 1, to);
}

/** The page that holds the item at `index` (counted from 0): used to show a subject that was just added. */
export const pageOfIndex = (index: number, size: number): number => (size <= 0 || index < 0 ? 1 : Math.floor(index / size) + 1);

export type PageButton = number | 'gap';

/** The numbered buttons to draw, at most seven: all of them when there are few pages, otherwise the first, the last and the ones around the current page, with gaps. */
export function pageButtons(current: number, count: number): PageButton[] {
  const numbers = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (count <= 7) return numbers(1, count);
  if (current <= 4) return [...numbers(1, 5), 'gap', count];
  if (current >= count - 3) return [1, 'gap', ...numbers(count - 4, count)];
  return [1, 'gap', current - 1, current, current + 1, 'gap', count];
}
