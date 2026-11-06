import { z } from 'zod';
import { toIsoDate } from '../utils/date';

const isoDate = z.string().min(1, 'REQUIRED').refine((value) => toIsoDate(value) !== null, 'INVALID_DATE');

// Mirrors AcademicController.YearRequest; the end date must be after the start date (END_BEFORE_START on the server).
export const academicYearSchema = z
  .object({
    nameKm: z.string().trim().min(1, 'REQUIRED').max(50, 'Size'),
    startDate: isoDate,
    endDate: isoDate,
  })
  .superRefine((value, ctx) => {
    if (toIsoDate(value.startDate) && toIsoDate(value.endDate) && value.endDate <= value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'END_BEFORE_START', path: ['endDate'] });
    }
  });

export type AcademicYearValues = z.infer<typeof academicYearSchema>;

// Mirrors AcademicController.SubjectRequest: the Khmer name is required, the English name is optional.
export const subjectSchema = z.object({
  nameKm: z.string().trim().min(1, 'REQUIRED').max(100, 'Size'),
  nameEn: z.string().trim().max(100, 'Size'),
});

export type SubjectValues = z.infer<typeof subjectSchema>;
