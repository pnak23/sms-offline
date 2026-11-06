import { z } from 'zod';
import { toIsoDate } from '../utils/date';

// Mirrors SchoolEventController.EventRequest: a title and a start day are required; it may end the day it starts, not before.
export const eventSchema = z
  .object({
    titleKm: z.string().trim().min(1, 'REQUIRED').max(150, 'Size'),
    startDate: z.string().min(1, 'REQUIRED').refine((value) => toIsoDate(value) !== null, 'INVALID_DATE'),
    endDate: z.string().refine((value): boolean => value === '' || toIsoDate(value) !== null, 'INVALID_DATE'),
    note: z.string().trim().max(500, 'Size'),
  })
  .superRefine((value, ctx) => {
    if (toIsoDate(value.startDate) && value.endDate && toIsoDate(value.endDate) && value.endDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'END_BEFORE_START', path: ['endDate'] });
    }
  });

export type EventValues = z.infer<typeof eventSchema>;
