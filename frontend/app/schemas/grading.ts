import { z } from 'zod';
import { parseDecimal } from '../utils/score';

export const MAX_BANDS = 12;
export const LABEL_MAX = 50;
export const LETTER_MAX = 5;

/** REQUIRED when empty, INVALID_NUMBER when not a number with at most two decimals, OUT_OF_RANGE outside 0-100; otherwise null. */
export function percentProblem(text: string): 'REQUIRED' | 'INVALID_NUMBER' | 'OUT_OF_RANGE' | null {
  if (text.trim() === '') return 'REQUIRED';
  const n = parseDecimal(text);
  if (Number.isNaN(n)) return 'INVALID_NUMBER';
  return n > 100 ? 'OUT_OF_RANGE' : null;
}

// Mirrors GradingScaleController.ScaleRequest (the bands are checked separately, see bandProblems()).
export const gradingScaleSchema = z.object({
  nameKm: z.string().trim().min(1, 'REQUIRED').max(100, 'Size'),
  passPercent: z.string().superRefine((value, ctx) => {
    const problem = percentProblem(value);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
});

export type GradingScaleValues = z.infer<typeof gradingScaleSchema>;

export interface BandRowValues {
  minPercent: string;
  labelKm: string;
  letter: string;
}

export interface BandRowProblem {
  minPercent?: string;
  labelKm?: string;
  letter?: string;
}

export interface BandProblems {
  rows: Record<number, BandRowProblem>;
  /** A problem with the list as a whole (none, too many, or nobody covers 0%). */
  general: string | null;
  ok: boolean;
}

/**
 * The checks GradingScaleService.validate() makes: 1-12 bands, each with a minimum percent (0-100), a label and a letter,
 * no two bands with the same minimum, and one band starting at 0 so every score falls into some band.
 */
export function bandProblems(bands: readonly BandRowValues[]): BandProblems {
  const rows: Record<number, BandRowProblem> = {};
  let general: string | null = null;
  if (bands.length === 0) general = 'BANDS_REQUIRED';
  else if (bands.length > MAX_BANDS) general = 'INVALID';

  const seen = new Map<number, number>();
  bands.forEach((band, index) => {
    const problem: BandRowProblem = {};
    const min = percentProblem(band.minPercent);
    if (min) problem.minPercent = min;
    else {
      const value = parseDecimal(band.minPercent);
      if (seen.has(value)) problem.minPercent = 'DUPLICATE';
      else seen.set(value, index);
    }
    const label = band.labelKm.trim();
    if (label === '') problem.labelKm = 'REQUIRED';
    else if (label.length > LABEL_MAX) problem.labelKm = 'Size';
    const letter = band.letter.trim();
    if (letter === '') problem.letter = 'REQUIRED';
    else if (letter.length > LETTER_MAX) problem.letter = 'Size';
    if (Object.keys(problem).length > 0) rows[index] = problem;
  });

  if (general === null && !seen.has(0) && Object.keys(rows).length === 0) general = 'BAND_ZERO_REQUIRED';
  return { rows, general, ok: general === null && Object.keys(rows).length === 0 };
}
