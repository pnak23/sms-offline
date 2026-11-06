import { z } from 'zod';
import { toIsoDate } from '../utils/date';

const optionalDate = z.string().refine((v) => v === '' || toIsoDate(v) !== null, 'INVALID_DATE');

// Mirrors StudentController.StudentRequest. Only the Khmer name, gender and date of birth are required (Phase 2 decision 9).
export const studentSchema = z.object({
  nameKm: z.string().trim().min(1, 'REQUIRED').max(100, 'Size'),
  nameEn: z.string().trim().max(100, 'Size'),
  // `: boolean` on purpose: without it TypeScript infers a type guard and narrows the form field to 'MALE' | 'FEMALE',
  // but "nothing chosen yet" is the empty string.
  gender: z.string().refine((v): boolean => v === 'MALE' || v === 'FEMALE', 'REQUIRED'),
  dateOfBirth: z
    .string()
    .min(1, 'REQUIRED')
    .superRefine((value, ctx) => {
      const iso = toIsoDate(value);
      if (!iso) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_DATE' });
      else if (iso >= new Date().toISOString().slice(0, 10)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Past' });
    }),
  enrollmentDate: optionalDate,
  placeOfBirth: z.string().trim().max(200, 'Size'),
  address: z.string().trim().max(500, 'Size'),
  village: z.string().trim().max(100, 'Size'),
  commune: z.string().trim().max(100, 'Size'),
  district: z.string().trim().max(100, 'Size'),
  province: z.string().trim().max(100, 'Size'),
  notes: z.string().trim().max(2000, 'Size'),
  classId: z.string(),
});

export type StudentValues = z.infer<typeof studentSchema>;

export const MAX_GUARDIANS = 5;

export interface GuardianRowValues {
  nameKm: string;
  relationship: string;
  phone: string;
  primary: boolean;
}

export interface GuardianRowProblem {
  nameKm?: string;
  relationship?: string;
  phone?: string;
}

/** Row index -> field -> validation code (empty object = fine). A guardian row needs a name and a relationship. */
export function guardianProblems(rows: readonly GuardianRowValues[]): Record<number, GuardianRowProblem> {
  const out: Record<number, GuardianRowProblem> = {};
  rows.forEach((row, index) => {
    const problem: GuardianRowProblem = {};
    if (row.nameKm.trim() === '') problem.nameKm = 'REQUIRED';
    else if (row.nameKm.trim().length > 100) problem.nameKm = 'Size';
    if (row.relationship === '') problem.relationship = 'REQUIRED';
    if (row.phone.trim().length > 50) problem.phone = 'Size';
    if (Object.keys(problem).length > 0) out[index] = problem;
  });
  return out;
}
