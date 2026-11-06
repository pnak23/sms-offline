import { z } from 'zod';
import { toIsoDate } from '../utils/date';
import { positiveAmountProblem } from './exam';

const isoDate = z.string().min(1, 'REQUIRED').refine((value) => toIsoDate(value) !== null, 'INVALID_DATE');

// Mirrors HomeworkController.HomeworkRequest: class, subject, title and both dates are required; it may be due the day it is assigned. `scored` says the homework has
// marks: then a maximum above zero is required (typed by the teacher, never defaulted); without it the homework is a record only and `maxScore` is ignored.
export const homeworkSchema = z
  .object({
    classId: z.string().min(1, 'REQUIRED'),
    subjectId: z.string().min(1, 'REQUIRED'),
    title: z.string().trim().min(1, 'REQUIRED').max(200, 'Size'),
    description: z.string().trim().max(2000, 'Size'),
    assignedDate: isoDate,
    dueDate: isoDate,
    remark: z.string().trim().max(500, 'Size'),
    scored: z.boolean().optional(),
    maxScore: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (toIsoDate(value.assignedDate) && toIsoDate(value.dueDate) && value.dueDate < value.assignedDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'DUE_BEFORE_ASSIGNED', path: ['dueDate'] });
    }
    if (value.scored) {
      const text = (value.maxScore ?? '').trim();
      if (text === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'REQUIRED', path: ['maxScore'] });
      else {
        const problem = positiveAmountProblem(text);
        if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ['maxScore'] });
      }
    }
  });

export type HomeworkValues = z.infer<typeof homeworkSchema>;
