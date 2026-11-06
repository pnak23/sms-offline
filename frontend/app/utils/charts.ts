// The pure geometry and keyboard rules of the dashboard's hand-built SVG charts. No library, no DOM: unit-tested (tests/charts.test.ts).

/** The colours of the charts. Boys / girls are a blue and a gold that stay apart for the common kinds of colour blindness; the charts also use labels and a table, never colour alone. */
export const CHART_COLORS = {
  boys: '#1d5c96',
  girls: '#d4a72c',
  unknown: '#8a94a3',
  present: '#1b7a4b',
  late: '#d98f00',
  partial: '#7b5ea7',
  absent: '#b42318',
  leave: '#5b7c99',
  passed: '#1b7a4b',
  failed: '#b42318',
  incomplete: '#8a94a3',
  students: '#1d5c96',
  over: '#b42318',
  money: '#1d5c96',
} as const;

/** A tidy upper end for an axis: 1, 2, 5 or 10 times a power of ten that is not below `max` (never below 1). */
export function niceCeil(max: number): number {
  if (!Number.isFinite(max) || max <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * power >= max) return step * power;
  return 10 * power;
}

/** value as a share of max, in 0..100 (0 when max is not above zero, never above 100 or below 0). */
export function share(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/** A whole percentage of a part in a total ("0" for an empty total). */
export function wholePercent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** "83.5" for 83.5 and "100" for 100: one decimal at most, and none when it would be ".0". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return String(Math.round(value * 10) / 10);
}

const point = (cx: number, cy: number, r: number, angle: number): [number, number] => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
const fixed = (n: number): string => n.toFixed(2);

/**
 * The path of each slice of a donut, starting at twelve o'clock and going clockwise. A zero value has no slice (null); a slice that is the whole ring is drawn as two half arcs
 * (a single arc of 360 degrees draws nothing). An empty total has no slices at all.
 */
export function donutPaths(values: number[], cx: number, cy: number, outer: number, inner: number): (string | null)[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0);
  if (!(total > 0)) return values.map(() => null);
  let start = -Math.PI / 2;
  return values.map((raw) => {
    const value = Math.max(0, raw);
    if (value === 0) return null;
    const sweep = (value / total) * Math.PI * 2;
    const end = start + sweep;
    let path: string;
    if (sweep >= Math.PI * 2 - 1e-6) {
      const [ox1, oy1] = point(cx, cy, outer, start);
      const [ox2, oy2] = point(cx, cy, outer, start + Math.PI);
      const [ix1, iy1] = point(cx, cy, inner, start);
      const [ix2, iy2] = point(cx, cy, inner, start + Math.PI);
      path = `M${fixed(ox1)} ${fixed(oy1)}A${outer} ${outer} 0 1 1 ${fixed(ox2)} ${fixed(oy2)}A${outer} ${outer} 0 1 1 ${fixed(ox1)} ${fixed(oy1)}Z`
        + `M${fixed(ix1)} ${fixed(iy1)}A${inner} ${inner} 0 1 0 ${fixed(ix2)} ${fixed(iy2)}A${inner} ${inner} 0 1 0 ${fixed(ix1)} ${fixed(iy1)}Z`;
    } else {
      const [ox1, oy1] = point(cx, cy, outer, start);
      const [ox2, oy2] = point(cx, cy, outer, end);
      const [ix2, iy2] = point(cx, cy, inner, end);
      const [ix1, iy1] = point(cx, cy, inner, start);
      const large = sweep > Math.PI ? 1 : 0;
      path = `M${fixed(ox1)} ${fixed(oy1)}A${outer} ${outer} 0 ${large} 1 ${fixed(ox2)} ${fixed(oy2)}L${fixed(ix2)} ${fixed(iy2)}A${inner} ${inner} 0 ${large} 0 ${fixed(ix1)} ${fixed(iy1)}Z`;
    }
    start = end;
    return path;
  });
}

/** The runs of consecutive indexes that have a value: a null is a GAP and breaks the line, it is never drawn as zero. */
export function runs(values: (number | null)[]): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (current.length) out.push(current);
      current = [];
    } else current.push(i);
  });
  if (current.length) out.push(current);
  return out;
}

/** The path of one run of a line; a run of a single point has no line (it is drawn as a dot). */
export function linePath(run: number[], values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  if (run.length < 2) return '';
  return run.map((i, k) => `${k === 0 ? 'M' : 'L'}${fixed(x(i))} ${fixed(y(values[i] as number))}`).join('');
}

/** The area under a run (down to `baseline`), closed, for the soft fill under a line. */
export function areaPath(run: number[], values: (number | null)[], x: (i: number) => number, y: (v: number) => number, baseline: number): string {
  if (run.length < 2) return '';
  const first = run[0] as number;
  const last = run[run.length - 1] as number;
  return `${linePath(run, values, x, y)}L${fixed(x(last))} ${fixed(baseline)}L${fixed(x(first))} ${fixed(baseline)}Z`;
}

/** "5/11" for 2026-11-05 (day / month: short enough for a crowded axis). */
export function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return month && day ? `${Number(day)}/${Number(month)}` : iso;
}

/** The index a key moves to inside a chart of `length` items (arrows, Home and End), or null when the key means nothing here. */
export function nextIndex(key: string, current: number, length: number): number | null {
  if (length <= 0) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return Math.min(length - 1, current + 1);
    case 'ArrowLeft':
    case 'ArrowUp':
      return Math.max(0, current - 1);
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}

/** Animation is for people who have not asked for less motion and whose PC is not on the Low-memory preset. */
export function motionAllowed(reducedMotion: boolean, preset: string | null | undefined): boolean {
  return !reducedMotion && preset !== 'low-memory';
}
