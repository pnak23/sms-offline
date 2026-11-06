/**
 * Lists are sorted on the client (docs D13): SQLite sorts by code point and the JDK has no Khmer rules. Chromium has no
 * `km` collation data, but its root collation puts Khmer in the right order (verified in the real shell, docs S1).
 */
const collator = new Intl.Collator('und', { numeric: true });

export function compareKhmer(a: string | null | undefined, b: string | null | undefined): number {
  return collator.compare(a ?? '', b ?? '');
}

/** A copy of `items` sorted by a Khmer text key, e.g. `sortByKhmer(students, (s) => s.nameKm)`. */
export function sortByKhmer<T>(items: readonly T[], key: (item: T) => string | null | undefined): T[] {
  return [...items].sort((x, y) => compareKhmer(key(x), key(y)));
}
