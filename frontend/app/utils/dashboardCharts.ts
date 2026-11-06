import type { ChartsAttendancePoint, ChartsClassFill, ChartsExam, ChartsFeeSeries, ChartsGender, ChartsGradeBar, FeeCurrency } from '../types/api';
import { CHART_COLORS, formatPercent, shortDate, wholePercent } from './charts';
import { monthNameKm } from './date';
import { formatMoney } from './money';
import type { Translate } from './reportTables';

// Turns the dashboard's chart data into what the chart components draw: rows, slices, points, a text summary and a table, each with a sentence that says what it shows.
// Pure functions of data and a translator (`t`), unit-tested without a browser (tests/charts.test.ts). Nothing here invents a figure: a gap stays a gap, a missing capacity stays
// missing, currencies stay apart.

export interface BarSegment { value: number; color: string; label: string }
export interface BarRow {
  key: string;
  label: string;
  segments: BarSegment[];
  /** A mark on the bar's scale (a capacity, the pass mark); null for none. */
  marker: number | null;
  /** What is written at the end of the row. */
  valueText: string;
  /** The sentence read out and shown when the row is chosen. */
  details: string;
}
export interface Slice { key: string; label: string; value: number; color: string; details: string }
export interface TrendPoint { key: string; label: string; value: number | null; recorded: boolean; details: string }
export interface ChartTableData { columns: string[]; rows: string[][] }

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

// ---- students by grade ---------------------------------------------------------------------------------------------------------------------------------------------------

export function gradeRows(t: Translate, grades: ChartsGradeBar[]): BarRow[] {
  return grades.map((g) => {
    const total = g.male + g.female + g.unknown;
    const segments: BarSegment[] = [
      { value: g.male, color: CHART_COLORS.boys, label: t('dashboard.charts.male') },
      { value: g.female, color: CHART_COLORS.girls, label: t('dashboard.charts.female') },
    ];
    if (g.unknown > 0) segments.push({ value: g.unknown, color: CHART_COLORS.unknown, label: t('dashboard.charts.unknown') });
    return {
      key: String(g.gradeId),
      label: g.nameKm,
      segments,
      marker: null,
      valueText: String(total),
      details: `${g.nameKm}: ${t('dashboard.charts.male')} ${g.male} · ${t('dashboard.charts.female')} ${g.female}${g.unknown > 0 ? ` · ${t('dashboard.charts.unknown')} ${g.unknown}` : ''} · ${t('dashboard.charts.total')} ${total}`,
    };
  });
}

export function gradeSummary(t: Translate, grades: ChartsGradeBar[], notInAClass: number): string {
  const total = sum(grades.map((g) => g.male + g.female + g.unknown));
  const largest = [...grades].sort((a, b) => b.male + b.female + b.unknown - (a.male + a.female + a.unknown))[0];
  const base = t('dashboard.charts.grades.summary', { total, grades: grades.filter((g) => g.male + g.female + g.unknown > 0).length, largest: largest ? largest.nameKm : '' });
  return notInAClass > 0 ? `${base} ${t('dashboard.charts.grades.notInAClass', { n: notInAClass })}` : base;
}

export function gradeTable(t: Translate, grades: ChartsGradeBar[]): ChartTableData {
  return {
    columns: [t('dashboard.charts.grade'), t('dashboard.charts.male'), t('dashboard.charts.female'), t('dashboard.charts.unknown'), t('dashboard.charts.total')],
    rows: grades.map((g) => [g.nameKm, String(g.male), String(g.female), String(g.unknown), String(g.male + g.female + g.unknown)]),
  };
}

// ---- gender --------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Boys, girls and (only when there are any) the students whose gender is not recorded: together they are the whole of the active students. */
export function genderSlices(t: Translate, gender: ChartsGender): Slice[] {
  const slices: Slice[] = [
    { key: 'male', label: t('dashboard.charts.male'), value: gender.male, color: CHART_COLORS.boys, details: '' },
    { key: 'female', label: t('dashboard.charts.female'), value: gender.female, color: CHART_COLORS.girls, details: '' },
  ];
  if (gender.unknown > 0) slices.push({ key: 'unknown', label: t('dashboard.charts.unknown'), value: gender.unknown, color: CHART_COLORS.unknown, details: '' });
  return slices.map((s) => ({ ...s, details: `${s.label}: ${s.value} (${wholePercent(s.value, gender.total)}%)` }));
}

export function genderSummary(t: Translate, gender: ChartsGender): string {
  return t('dashboard.charts.gender.summary', { total: gender.total, male: gender.male, female: gender.female, unknown: gender.unknown });
}

export function genderTable(t: Translate, gender: ChartsGender): ChartTableData {
  return {
    columns: [t('dashboard.charts.gender.title'), t('dashboard.charts.count'), t('dashboard.charts.share')],
    rows: [
      [t('dashboard.charts.male'), String(gender.male), `${wholePercent(gender.male, gender.total)}%`],
      [t('dashboard.charts.female'), String(gender.female), `${wholePercent(gender.female, gender.total)}%`],
      [t('dashboard.charts.unknown'), String(gender.unknown), `${wholePercent(gender.unknown, gender.total)}%`],
      [t('dashboard.charts.total'), String(gender.total), gender.total > 0 ? '100%' : '0%'],
    ],
  };
}

// ---- attendance ----------------------------------------------------------------------------------------------------------------------------------------------------------

export function trendPoints(t: Translate, days: ChartsAttendancePoint[], classes: number): TrendPoint[] {
  return days.map((d) => {
    const label = shortDate(d.date);
    if (!d.recorded) return { key: d.date, label, value: null, recorded: false, details: `${label}: ${t('dashboard.charts.attendance.gap')}` };
    if (d.presentPercent === null) return { key: d.date, label, value: null, recorded: true, details: `${label}: ${t('dashboard.charts.attendance.noRecords', { n: d.classesRecorded, classes })}` };
    return {
      key: d.date,
      label,
      value: d.presentPercent,
      recorded: true,
      details: t('dashboard.charts.attendance.day', {
        date: label, percent: formatPercent(d.presentPercent), present: d.present ?? 0, late: d.late ?? 0, partial: d.partial ?? 0, absent: d.absent ?? 0, leave: d.leave ?? 0, n: d.classesRecorded, classes,
      }),
    };
  });
}

/** The values of the small trend on the attendance tile: the newest `count` points of the axis (a gap stays null). */
export function attendanceSparkline(days: ChartsAttendancePoint[], count = 7): (number | null)[] {
  return days.slice(-count).map((d) => d.presentPercent);
}

export function attendanceSummary(t: Translate, days: ChartsAttendancePoint[], basis: 'DAY' | 'SESSION'): string {
  const recorded = days.filter((d) => d.recorded && d.presentPercent !== null);
  const gaps = days.filter((d) => !d.recorded).length;
  if (recorded.length === 0) return t('dashboard.charts.attendance.summaryNone');
  const mean = recorded.reduce((a, d) => a + (d.presentPercent as number), 0) / recorded.length;
  const newest = recorded[recorded.length - 1] as ChartsAttendancePoint;
  return t('dashboard.charts.attendance.summary', { days: recorded.length, mean: formatPercent(mean), newest: formatPercent(newest.presentPercent), gaps, basis: t(`attendance.basis.${basis}`) });
}

export function trendTable(t: Translate, days: ChartsAttendancePoint[]): ChartTableData {
  const cell = (n: number | null): string => (n === null ? '—' : String(n));
  return {
    columns: [t('dashboard.charts.date'), t('dashboard.charts.attendance.percent'), t('dashboard.charts.attendance.present'), t('dashboard.charts.attendance.late'), t('dashboard.charts.attendance.partial'),
      t('dashboard.charts.attendance.absent'), t('dashboard.charts.attendance.leave'), t('dashboard.charts.attendance.classes')],
    rows: days.map((d) => [shortDate(d.date), d.presentPercent === null ? (d.recorded ? '—' : t('dashboard.charts.attendance.gap')) : `${formatPercent(d.presentPercent)}%`,
      cell(d.present), cell(d.late), cell(d.partial), cell(d.absent), cell(d.leave), d.recorded ? String(d.classesRecorded) : '—']),
  };
}

// ---- class fill ----------------------------------------------------------------------------------------------------------------------------------------------------------

/** One row per class: its head count against the capacity stored for it. With no stored capacity the bar is the head count alone and says so. */
export function fillRows(t: Translate, classes: ChartsClassFill[]): { rows: BarRow[]; max: number } {
  const max = Math.max(1, ...classes.map((c) => Math.max(c.students, c.capacity ?? 0)));
  const rows = classes.map((c) => {
    const name = `${c.gradeName} ${c.nameKm}`;
    const over = c.capacity !== null && c.students > c.capacity;
    return {
      key: String(c.classId),
      label: name,
      segments: [{ value: c.students, color: over ? CHART_COLORS.over : CHART_COLORS.students, label: t('dashboard.charts.fill.students') }],
      marker: c.capacity,
      valueText: c.capacity === null ? String(c.students) : `${c.students} / ${c.capacity}`,
      details: c.capacity === null
        ? `${name}: ${t('dashboard.charts.fill.noCapacity', { n: c.students })}`
        : `${name}: ${t(over ? 'dashboard.charts.fill.over' : 'dashboard.charts.fill.within', { n: c.students, capacity: c.capacity })}`,
    };
  });
  return { rows, max };
}

export function fillSummary(t: Translate, classes: ChartsClassFill[]): string {
  const withCapacity = classes.filter((c) => c.capacity !== null);
  const over = withCapacity.filter((c) => c.students > (c.capacity as number)).length;
  const students = sum(classes.map((c) => c.students));
  return t('dashboard.charts.fill.summary', { classes: classes.length, students, over, noCapacity: classes.length - withCapacity.length });
}

export function fillTable(t: Translate, classes: ChartsClassFill[]): ChartTableData {
  return {
    columns: [t('students.class'), t('dashboard.charts.fill.students'), t('dashboard.charts.fill.capacity')],
    rows: classes.map((c) => [`${c.gradeName} ${c.nameKm}`, String(c.students), c.capacity === null ? '—' : String(c.capacity)]),
  };
}

// ---- the latest examination ----------------------------------------------------------------------------------------------------------------------------------------------

export function examRows(t: Translate, exam: ChartsExam): BarRow[] {
  return exam.classes.map((c) => {
    const name = `${c.gradeName} ${c.nameKm}`;
    const average = c.averagePercent;
    return {
      key: String(c.classId),
      label: name,
      segments: average === null ? [] : [{ value: average, color: exam.passPercent !== null && average < exam.passPercent ? CHART_COLORS.failed : CHART_COLORS.passed, label: t('dashboard.charts.exam.average') }],
      marker: exam.passPercent,
      valueText: average === null ? '—' : `${formatPercent(average)}%`,
      details: average === null
        ? `${name}: ${t('dashboard.charts.exam.noneComplete', { students: c.students })}`
        : `${name}: ${t('dashboard.charts.exam.class', { average: formatPercent(average), passed: c.passed, failed: c.failed, incomplete: c.incomplete })}`,
    };
  });
}

export function examTotals(exam: ChartsExam): { passed: number; failed: number; incomplete: number; complete: number } {
  return {
    passed: sum(exam.classes.map((c) => c.passed)),
    failed: sum(exam.classes.map((c) => c.failed)),
    incomplete: sum(exam.classes.map((c) => c.incomplete)),
    complete: sum(exam.classes.map((c) => c.complete)),
  };
}

export function examSlices(t: Translate, exam: ChartsExam): Slice[] {
  const totals = examTotals(exam);
  const all = totals.passed + totals.failed + totals.incomplete;
  return [
    { key: 'passed', label: t('dashboard.charts.exam.passed'), value: totals.passed, color: CHART_COLORS.passed },
    { key: 'failed', label: t('dashboard.charts.exam.failed'), value: totals.failed, color: CHART_COLORS.failed },
    { key: 'incomplete', label: t('dashboard.charts.exam.incomplete'), value: totals.incomplete, color: CHART_COLORS.incomplete },
  ].map((s) => ({ ...s, details: `${s.label}: ${s.value} (${wholePercent(s.value, all)}%)` }));
}

export function examSummary(t: Translate, exam: ChartsExam): string {
  const totals = examTotals(exam);
  return t('dashboard.charts.exam.summary', { name: exam.nameKm, classes: exam.classes.length, passed: totals.passed, failed: totals.failed, incomplete: totals.incomplete, pass: exam.passPercent === null ? '' : formatPercent(exam.passPercent) });
}

export function examTable(t: Translate, exam: ChartsExam): ChartTableData {
  return {
    columns: [t('students.class'), t('dashboard.charts.exam.average'), t('dashboard.charts.exam.passed'), t('dashboard.charts.exam.failed'), t('dashboard.charts.exam.incomplete')],
    rows: exam.classes.map((c) => [`${c.gradeName} ${c.nameKm}`, c.averagePercent === null ? '—' : `${formatPercent(c.averagePercent)}%`, String(c.passed), String(c.failed), String(c.incomplete)]),
  };
}

// ---- fees: one block per currency, never combined --------------------------------------------------------------------------------------------------------------------------------

export interface FeeBlock { currency: FeeCurrency; rows: BarRow[]; max: number; total: string; table: ChartTableData }

export function feeBlocks(t: Translate, series: ChartsFeeSeries[]): FeeBlock[] {
  return series.map((s) => {
    const max = Math.max(1, ...s.months.map((m) => m.collected));
    const rows = s.months.map((m) => {
      const label = `${monthNameKm(`${m.month}-01`)} ${m.month.slice(0, 4)}`;
      return {
        key: `${s.currency}-${m.month}`,
        label,
        segments: [{ value: m.collected, color: CHART_COLORS.money, label: t('dashboard.charts.fees.collected') }],
        marker: null,
        valueText: formatMoney(m.collected, s.currency),
        details: `${label}: ${t('dashboard.charts.fees.month', { amount: formatMoney(m.collected, s.currency) })}`,
      };
    });
    const total = s.months.reduce((a, m) => a + m.collected, 0);
    return {
      currency: s.currency,
      rows,
      max,
      total: formatMoney(total, s.currency),
      table: { columns: [t('dashboard.charts.month'), t('dashboard.charts.fees.collected')], rows: s.months.map((m) => [`${monthNameKm(`${m.month}-01`)} ${m.month.slice(0, 4)}`, formatMoney(m.collected, s.currency)]) },
    };
  });
}

/** No payment at all in the last six months, in any currency: an empty chart says so instead of drawing six empty bars. */
export function feesEmpty(series: ChartsFeeSeries[]): boolean {
  return series.every((s) => s.months.every((m) => m.collected === 0));
}
