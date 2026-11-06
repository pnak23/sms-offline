import { z } from 'zod';
import { parseWholeNumber } from '../utils/khmer';

// Mirrors ClassController.ClassRequest: capacity 1-200 (empty = the default of 40), Khmer digits accepted.
export const CAPACITY_RANGE = { min: 1, max: 200 } as const;
export const DEFAULT_CAPACITY = 40;

export const classSchema = z.object({
  gradeId: z.string().min(1, 'REQUIRED'),
  nameKm: z.string().trim().min(1, 'REQUIRED').max(50, 'Size'),
  capacity: z.string().superRefine((value, ctx) => {
    if (value.trim() === '') return;
    const n = parseWholeNumber(value);
    if (Number.isNaN(n)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_NUMBER' });
    else if (n < CAPACITY_RANGE.min || n > CAPACITY_RANGE.max) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OUT_OF_RANGE' });
  }),
  homeroomTeacherId: z.string(),
});

export type ClassValues = z.infer<typeof classSchema>;

/** The capacity box as a number, or null for "use the default". */
export function capacityOf(text: string): number | null {
  return text.trim() === '' ? null : parseWholeNumber(text);
}
