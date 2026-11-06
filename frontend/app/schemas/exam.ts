import { z } from 'zod';
import type { ExamKind } from '../types/api';
import { toIsoDate } from '../utils/date';
import { parseDecimal, parseWholeNumberInRange } from '../utils/score';

export const EXAM_KINDS: readonly ExamKind[] = ['MONTHLY', 'MIDTERM', 'FINAL', 'OTHER'];
export const TERM_RANGE = { min: 1, max: 12 } as const;
/** The largest maximum score or weight the backend accepts. */
export const SCORE_LIMIT = 100000;

const optionalDate = z.string().refine((value): boolean => value === '' || toIsoDate(value) !== null, 'INVALID_DATE');

// Mirrors ExaminationController.ExamRequest: name and kind required, term 1-12 or empty, dates optional (the end may equal the start).
export const examSchema = z
  .object({
    nameKm: z.string().trim().min(1, 'REQUIRED').max(100, 'Size'),
    kind: z.string().min(1, 'REQUIRED'),
    termNo: z.string().superRefine((value, ctx) => {
      if (value.trim() === '') return;
      const n = parseWholeNumberInRange(value, TERM_RANGE.min, TERM_RANGE.max);
      if (n === 'invalid') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_NUMBER' });
      else if (n === 'range') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OUT_OF_RANGE' });
    }),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && toIsoDate(value.startDate) && toIsoDate(value.endDate) && value.endDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'END_BEFORE_START', path: ['endDate'] });
    }
  });

export type ExamValues = z.infer<typeof examSchema>;

/** The term box as a number, or null when empty. */
export function termOf(text: string): number | null {
  const n = parseWholeNumberInRange(text, TERM_RANGE.min, TERM_RANGE.max);
  return typeof n === 'number' ? n : null;
}

/** What is wrong with a maximum score or weight typed in the subject table, or null when it is fine. */
export function positiveAmountProblem(text: string): 'INVALID_NUMBER' | 'OUT_OF_RANGE' | null {
  const n = parseDecimal(text);
  if (Number.isNaN(n)) return 'INVALID_NUMBER';
  return n <= 0 || n > SCORE_LIMIT ? 'OUT_OF_RANGE' : null;
}
