// The dashboard's hand-built charts: the geometry and keyboard rules, and the rules the owner set for what each chart may show (gaps stay gaps, an unrecorded gender stays in the totals,
// no capacity is made up, currencies are never combined, nothing about the timetable or homework).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChartsAttendancePoint, ChartsClassFill, ChartsExam, ChartsFeeSeries, ChartsGradeBar } from '~/types/api';
import { areaPath, donutPaths, formatPercent, linePath, motionAllowed, nextIndex, niceCeil, runs, share, shortDate, wholePercent } from '~/utils/charts';
import {
  attendanceSparkline, attendanceSummary, examRows, examSlices, examTotals, feeBlocks, feesEmpty, fillRows, fillSummary, genderSlices, genderTable, gradeRows, gradeSummary, trendPoints, trendTable,
} from '~/utils/dashboardCharts';

const t = (key: string, params?: Record<string, unknown>): string => (params ? `${key}:${JSON.stringify(params)}` : key);

describe('the geometry', () => {
  it('rounds an axis end up to 1, 2, 5 or 10 times a power of ten', () => {
    expect([0, 1, 1.2, 2, 3, 7, 12, 40, 41, 99, 101, 640].map(niceCeil)).toEqual([1, 1, 2, 2, 5, 10, 20, 50, 50, 100, 200, 1000]);
    expect(niceCeil(Number.NaN)).toBe(1);
  });

  it('a share is clamped to 0..100 and an empty scale is zero, never NaN', () => {
    expect(share(5, 10)).toBe(50);
    expect(share(15, 10)).toBe(100);
    expect(share(-1, 10)).toBe(0);
    expect(share(5, 0)).toBe(0);
    expect(wholePercent(1, 3)).toBe(33);
    expect(wholePercent(1, 0)).toBe(0);
    expect(formatPercent(83.46)).toBe('83.5');
    expect(formatPercent(100)).toBe('100');
    expect(formatPercent(null)).toBe('');
  });

  it('a donut has one slice per value, none for zero, a whole ring for a single value, and nothing at all for an empty total', () => {
    const [a, b, c] = donutPaths([3, 0, 1], 60, 60, 54, 35);
    expect(a).toMatch(/^M[\d. -]+A/);
    expect(b).toBeNull();
    expect(c).toBeTruthy();
    expect(a).not.toContain('NaN');
    const whole = donutPaths([5], 60, 60, 54, 35)[0] as string;
    expect(whole.match(/A/g)).toHaveLength(4);        // the outer and the inner circle, each as two half arcs
    expect(donutPaths([0, 0], 60, 60, 54, 35)).toEqual([null, null]);
    expect(donutPaths([-2, 4], 60, 60, 54, 35)[0]).toBeNull();   // a negative value is not a slice
  });

  it('a GAP breaks the line: runs are the stretches that have values, and a lone point has a dot but no line', () => {
    expect(runs([1, 2, null, 3, null, null, 4, 5, 6])).toEqual([[0, 1], [3], [6, 7, 8]]);
    expect(runs([null, null])).toEqual([]);
    const x = (i: number): number => i * 10;
    const y = (v: number): number => 100 - v;
    expect(linePath([0, 1], [10, 20], x, y)).toBe('M0.00 90.00L10.00 80.00');
    expect(linePath([3], [null, null, null, 5], x, y)).toBe('');
    expect(areaPath([0, 1], [10, 20], x, y, 100)).toBe('M0.00 90.00L10.00 80.00L10.00 100.00L0.00 100.00Z');
  });

  it('the arrow keys, Home and End move within the chart and stop at its ends; other keys mean nothing', () => {
    expect(nextIndex('ArrowRight', 0, 3)).toBe(1);
    expect(nextIndex('ArrowDown', 2, 3)).toBe(2);
    expect(nextIndex('ArrowLeft', 0, 3)).toBe(0);
    expect(nextIndex('ArrowUp', 2, 3)).toBe(1);
    expect(nextIndex('Home', 2, 3)).toBe(0);
    expect(nextIndex('End', 0, 3)).toBe(2);
    expect(nextIndex('a', 0, 3)).toBeNull();
    expect(nextIndex('ArrowRight', 0, 0)).toBeNull();
  });

  it('animation is off for reduced motion and for the Low-memory preset, and on otherwise', () => {
    expect(motionAllowed(false, 'standard')).toBe(true);
    expect(motionAllowed(true, 'standard')).toBe(false);
    expect(motionAllowed(false, 'low-memory')).toBe(false);
    expect(motionAllowed(true, 'low-memory')).toBe(false);
    expect(motionAllowed(false, null)).toBe(true);
    expect(shortDate('2026-11-05')).toBe('5/11');
  });
});

describe('students by grade and gender', () => {
  const grades: ChartsGradeBar[] = [
    { gradeId: 1, level: 1, nameKm: 'ថ្នាក់ទី១', male: 5, female: 4, unknown: 0 },
    { gradeId: 2, level: 2, nameKm: 'ថ្នាក់ទី២', male: 0, female: 0, unknown: 0 },
    { gradeId: 3, level: 3, nameKm: 'ថ្នាក់ទី៣', male: 2, female: 1, unknown: 3 },
  ];

  it('every grade has a row (an empty one is a bar of nothing, not missing); the unknown segment exists only where there are such students, and totals include them', () => {
    const rows = gradeRows(t, grades);
    expect(rows.map((r) => r.valueText)).toEqual(['9', '0', '6']);
    expect(rows[0]?.segments).toHaveLength(2);
    expect(rows[2]?.segments.map((s) => s.value)).toEqual([2, 1, 3]);
    expect(rows[2]?.details).toContain('dashboard.charts.unknown');
    expect(rows[0]?.details).not.toContain('dashboard.charts.unknown');
  });

  it('the summary says how many students are not in any class', () => {
    expect(gradeSummary(t, grades, 0)).toContain('"total":15');
    expect(gradeSummary(t, grades, 4)).toContain('dashboard.charts.grades.notInAClass:{"n":4}');
  });

  it('the gender chart includes the unrecorded: boys, girls and (only if any) unknown add up to the total, with the share of each', () => {
    const slices = genderSlices(t, { male: 6, female: 3, unknown: 1, total: 10 });
    expect(slices.map((s) => s.key)).toEqual(['male', 'female', 'unknown']);
    expect(slices.reduce((a, s) => a + s.value, 0)).toBe(10);
    expect(slices[2]?.details).toContain('(10%)');
    expect(genderSlices(t, { male: 6, female: 4, unknown: 0, total: 10 }).map((s) => s.key)).toEqual(['male', 'female']);
    const table = genderTable(t, { male: 6, female: 3, unknown: 1, total: 10 });
    expect(table.rows.map((r) => r[1])).toEqual(['6', '3', '1', '10']);
    expect(table.rows[3]?.[2]).toBe('100%');
  });
});

describe('attendance: a missing record is a gap, never a zero', () => {
  const day = (date: string, over: Partial<ChartsAttendancePoint> = {}): ChartsAttendancePoint => ({
    date, recorded: true, classesRecorded: 5, present: 80, late: 5, partial: 5, absent: 8, leave: 2, total: 100, presentPercent: 80, ...over,
  });
  const gap = (date: string): ChartsAttendancePoint => ({ date, recorded: false, classesRecorded: 0, present: null, late: null, partial: null, absent: null, leave: null, total: null, presentPercent: null });
  const days = [day('2026-11-02'), gap('2026-11-03'), day('2026-11-04', { presentPercent: 90.5 }), day('2026-11-05', { presentPercent: null, total: 0 })];

  it('a day without any record has no value and says so; a sheet with no records has none either; a recorded day carries its figures and its coverage', () => {
    const points = trendPoints(t, days, 7);
    expect(points.map((p) => p.value)).toEqual([80, null, 90.5, null]);
    expect(points.map((p) => p.recorded)).toEqual([true, false, true, true]);
    expect(points[1]?.details).toBe('3/11: dashboard.charts.attendance.gap');
    expect(points[3]?.details).toContain('dashboard.charts.attendance.noRecords');
    expect(points[0]?.details).toContain('"present":80');
    expect(points[0]?.details).toContain('"n":5,"classes":7');
  });

  it('the small trend on the tile keeps the gaps and takes the newest points', () => {
    const many = Array.from({ length: 10 }, (_, i) => day(`2026-11-${String(i + 1).padStart(2, '0')}`, { presentPercent: i === 5 ? null : 70 + i }));
    const spark = attendanceSparkline(many);
    expect(spark).toHaveLength(7);
    expect(spark).toEqual([73, 74, null, 76, 77, 78, 79]);   // days 4 to 10; the 6th day had no figure and stays a gap
  });

  it('the summary counts the gaps separately and says nothing is recorded when nothing is', () => {
    expect(attendanceSummary(t, days, 'DAY')).toContain('"gaps":1');
    expect(attendanceSummary(t, days, 'DAY')).toContain('"days":2');   // two days have a figure
    expect(attendanceSummary(t, [gap('2026-11-03')], 'DAY')).toBe('dashboard.charts.attendance.summaryNone');
  });

  it('the table shows a dash, not a zero, where there is no figure', () => {
    const table = trendTable(t, days);
    expect(table.rows[1]).toEqual(['3/11', 'dashboard.charts.attendance.gap', '—', '—', '—', '—', '—', '—']);
    expect(table.rows[0]?.[1]).toBe('80%');
  });
});

describe('class fill: no capacity is made up', () => {
  const classes: ChartsClassFill[] = [
    { classId: 1, nameKm: 'ក', gradeName: 'ថ្នាក់ទី១', level: 1, students: 30, capacity: 40 },
    { classId: 2, nameKm: 'ខ', gradeName: 'ថ្នាក់ទី១', level: 1, students: 45, capacity: 40 },
    { classId: 3, nameKm: 'ក', gradeName: 'ថ្នាក់ទី២', level: 2, students: 12, capacity: null },
  ];

  it('a class with a stored capacity shows it as a mark; one over it is red; one with none shows its head count alone and says so', () => {
    const { rows, max } = fillRows(t, classes);
    expect(max).toBe(45);
    expect(rows[0]).toMatchObject({ valueText: '30 / 40', marker: 40 });
    expect(rows[1]?.segments[0]?.color).toBe('#b42318');
    expect(rows[1]?.details).toContain('dashboard.charts.fill.over');
    expect(rows[2]).toMatchObject({ valueText: '12', marker: null });
    expect(rows[2]?.details).toContain('dashboard.charts.fill.noCapacity');
  });

  it('the summary counts the classes over capacity and the classes with no capacity separately', () => {
    expect(fillSummary(t, classes)).toContain('"over":1,"noCapacity":1');
  });
});

describe('the latest examination: the report cards\' own figures', () => {
  const exam: ChartsExam = {
    examinationId: 7, nameKm: 'ប្រឡងខែ', kind: 'MONTHLY', passPercent: 50, scaleName: 'ស្តង់ដារ',
    classes: [
      { classId: 1, nameKm: 'ក', gradeName: 'ថ្នាក់ទី១', students: 10, complete: 8, incomplete: 2, averagePercent: 72.4, passed: 7, failed: 1 },
      { classId: 2, nameKm: 'ខ', gradeName: 'ថ្នាក់ទី១', students: 9, complete: 0, incomplete: 9, averagePercent: null, passed: 0, failed: 0 },
      { classId: 3, nameKm: 'ក', gradeName: 'ថ្នាក់ទី២', students: 5, complete: 5, incomplete: 0, averagePercent: 41, passed: 1, failed: 4 },
    ],
  };

  it('a class where nobody is complete has no bar and no average (not zero); the pass mark is on every bar; an average under the pass mark is red', () => {
    const rows = examRows(t, exam);
    expect(rows[0]).toMatchObject({ valueText: '72.4%', marker: 50 });
    expect(rows[0]?.segments[0]?.color).toBe('#1b7a4b');
    expect(rows[1]?.segments).toEqual([]);
    expect(rows[1]?.valueText).toBe('—');
    expect(rows[2]?.segments[0]?.color).toBe('#b42318');
  });

  it('the totals and the donut count passed, failed and not complete once each, never together', () => {
    expect(examTotals(exam)).toEqual({ passed: 8, failed: 5, incomplete: 11, complete: 13 });
    const slices = examSlices(t, exam);
    expect(slices.map((s) => s.value)).toEqual([8, 5, 11]);
    expect(slices[0]?.details).toContain('(33%)');
  });
});

describe('fees: one block per currency, never combined', () => {
  const series: ChartsFeeSeries[] = [
    { currency: 'KHR', months: [{ month: '2026-10', collected: 40000 }, { month: '2026-11', collected: 60000 }] },
    { currency: 'USD', months: [{ month: '2026-10', collected: 0 }, { month: '2026-11', collected: 25 }] },
  ];

  it('each currency has its own block, scale, total and table; nothing is added across them', () => {
    const blocks = feeBlocks(t, series);
    expect(blocks.map((b) => b.currency)).toEqual(['KHR', 'USD']);
    expect(blocks[0]?.max).toBe(60000);
    expect(blocks[1]?.max).toBe(25);
    expect(blocks[0]?.total).toContain('100,000');
    expect(blocks[1]?.total).toContain('25');
    expect(blocks[0]?.total).not.toContain('125');
    expect(blocks[0]?.rows[1]?.valueText).toContain('60,000');
    expect(blocks[1]?.table.rows).toHaveLength(2);
  });

  it('with no payment in any currency the chart is empty (a sentence instead of six empty bars)', () => {
    expect(feesEmpty([{ currency: 'KHR', months: [{ month: '2026-11', collected: 0 }] }])).toBe(true);
    expect(feesEmpty(series)).toBe(false);
  });
});

describe('the dashboard stays out of the timetable and homework', () => {
  const APP = path.resolve(__dirname, '..', 'app');
  const walk = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : [path.join(dir, n)])) : []);

  it('no dashboard or chart file mentions either module (they are independent by rule)', () => {
    const files = [path.join(APP, 'pages', 'dashboard.vue'), path.join(APP, 'utils', 'charts.ts'), path.join(APP, 'utils', 'dashboardCharts.ts'), path.join(APP, 'composables', 'useChartMotion.ts'),
      ...walk(path.join(APP, 'components', 'dashboard')), ...walk(path.join(APP, 'components', 'charts'))];
    expect(files.length).toBeGreaterThan(12);
    const mentions = files.filter((f) => /timetable|homework/i.test(readFileSync(f, 'utf8'))).map((f) => path.relative(APP, f));
    expect(mentions).toEqual([]);
  });

  it('the charts read nothing but the dashboard\'s own endpoint', () => {
    const page = readFileSync(path.join(APP, 'pages', 'dashboard.vue'), 'utf8');
    expect(page).toContain('dashboardApi.charts()');
    for (const file of walk(path.join(APP, 'components', 'charts'))) expect(readFileSync(file, 'utf8')).not.toMatch(/Api\b|http\./);
  });
});
