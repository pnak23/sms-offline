import { z } from 'zod';
import { parseWholeNumber } from '../utils/khmer';

// Ranges mirror AppSettingsService: backup.reminderDays 0-90 (0 = no reminder to copy a backup to a USB stick, the default), ui.idleLockMinutes 1-120. Inputs may use Khmer digits.
export const REMINDER_DAYS_RANGE = { min: 0, max: 90 } as const;
export const IDLE_LOCK_RANGE = { min: 1, max: 120 } as const;

const wholeNumberIn = (range: { min: number; max: number }) =>
  z
    .string()
    .min(1, 'REQUIRED')
    .superRefine((value, ctx) => {
      const n = parseWholeNumber(value);
      if (Number.isNaN(n)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_NUMBER' });
      else if (n < range.min || n > range.max) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OUT_OF_RANGE' });
    });

export const preferencesSchema = z.object({
  reminderDays: wholeNumberIn(REMINDER_DAYS_RANGE),
  idleLockMinutes: wholeNumberIn(IDLE_LOCK_RANGE),
});

export type PreferencesValues = z.infer<typeof preferencesSchema>;
