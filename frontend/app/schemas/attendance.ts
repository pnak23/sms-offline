import { z } from 'zod';
import { isClockTime } from '../utils/attendance';

/** "7:30" is accepted and kept as "07:30" (the form says 24-hour: the Windows clock format of the PC is never relied on). */
export function normalizeClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  return match ? `${match[1]!.padStart(2, '0')}:${match[2]}` : value.trim();
}

// Mirrors AttendancePeriodController.CreateRequest / UpdateRequest: a name; the times are both or neither, 24-hour HH:mm, the end after the start.
// Nothing here compares a session with the clock or with another session: the school decides what its day looks like.
export const attendancePeriodSchema = z
  .object({
    nameKm: z.string().trim().min(1, 'REQUIRED').max(50, 'Size'),
    startTime: z.string().trim(),
    endTime: z.string().trim(),
  })
  .superRefine((value, ctx) => {
    const start = normalizeClock(value.startTime);
    const end = normalizeClock(value.endTime);
    if (start === '' && end === '') return;
    if (start === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'REQUIRED', path: ['startTime'] });
    else if (!isClockTime(start)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_TIME', path: ['startTime'] });
    if (end === '') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'REQUIRED', path: ['endTime'] });
    else if (!isClockTime(end)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_TIME', path: ['endTime'] });
    else if (isClockTime(start) && end <= start) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'END_TIME_BEFORE_START', path: ['endTime'] });
  });

export type AttendancePeriodValues = z.infer<typeof attendancePeriodSchema>;
