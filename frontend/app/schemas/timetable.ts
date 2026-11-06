import { z } from 'zod';
import { isClockTime } from '../utils/attendance';
import { normalizeClock } from './attendance';

// Mirrors TimetableController.SlotCreateRequest / SlotUpdateRequest: a name, both times (24-hour HH:mm) with the end after the start, and whether the row is a break.
// Whether a slot overlaps another slot of the year is the server's call (it knows the others).
export const timetableSlotSchema = z
  .object({
    nameKm: z.string().trim().min(1, 'REQUIRED').max(50, 'Size'),
    startTime: z.string().trim(),
    endTime: z.string().trim(),
    breakSlot: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const start = normalizeClock(value.startTime);
    const end = normalizeClock(value.endTime);
    if (start === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'REQUIRED', path: ['startTime'] });
    else if (!isClockTime(start)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_TIME', path: ['startTime'] });
    if (end === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'REQUIRED', path: ['endTime'] });
    else if (!isClockTime(end)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_TIME', path: ['endTime'] });
    else if (isClockTime(start) && end <= start) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'END_TIME_BEFORE_START', path: ['endTime'] });
  });

export type TimetableSlotValues = z.infer<typeof timetableSlotSchema>;
