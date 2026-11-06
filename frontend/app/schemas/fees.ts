import { z } from 'zod';
import type { FeeCurrency } from '../types/api';
import { toIsoDate, todayIso } from '../utils/date';
import { parseDefaultAmount, parseMoney } from '../utils/money';

export const PAYMENT_METHODS = ['CASH', 'BANK', 'OTHER'] as const;
const optionalDate = z.string().refine((value): boolean => value === '' || toIsoDate(value) !== null, 'INVALID_DATE');

export const currencyOf = (value: string): FeeCurrency => (value === 'USD' ? 'USD' : 'KHR');

// Mirrors FeeController.CategoryRequest: a name, a currency, and a default amount that may be empty or 0 ("ask each time").
export const feeCategorySchema = z
  .object({
    nameKm: z.string().trim().min(1, 'REQUIRED').max(100, 'Size'),
    currency: z.string().min(1, 'REQUIRED'),
    defaultAmount: z.string(),
  })
  .superRefine((value, ctx) => {
    if (Number.isNaN(parseDefaultAmount(value.defaultAmount, currencyOf(value.currency)))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INVALID_NUMBER', path: ['defaultAmount'] });
    }
  });

export type FeeCategoryValues = z.infer<typeof feeCategorySchema>;

// A charge (ChargeRequest): a category, an amount that may be empty (the category's default), a due date, a note.
// The amount is checked against the chosen category's currency by whoever knows it (see amountProblem).
export const feeChargeSchema = z.object({
  categoryId: z.string().min(1, 'REQUIRED'),
  amount: z.string(),
  dueDate: optionalDate,
  note: z.string().trim().max(200, 'Size'),
});

export type FeeChargeValues = z.infer<typeof feeChargeSchema>;

/** INVALID_NUMBER when an amount that was typed is not a valid amount in that currency; an empty box is fine (it means the default). */
export function amountProblem(text: string, currency: FeeCurrency): 'INVALID_NUMBER' | null {
  return text.trim() === '' || !Number.isNaN(parseMoney(text, currency)) ? null : 'INVALID_NUMBER';
}

// A payment (PaymentRequest): an amount above 0 in the charge's currency, the day it was paid (not in the future), how, and a reference.
export const feePaymentSchema = z
  .object({
    amount: z.string().min(1, 'REQUIRED'),
    paidOn: z.string().min(1, 'REQUIRED').refine((value) => toIsoDate(value) !== null, 'INVALID_DATE'),
    method: z.string().min(1, 'REQUIRED'),
    reference: z.string().trim().max(100, 'Size'),
  })
  .superRefine((value, ctx) => {
    if (toIsoDate(value.paidOn) && value.paidOn > todayIso()) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'FUTURE_DATE', path: ['paidOn'] });
  });

export type FeePaymentValues = z.infer<typeof feePaymentSchema>;

export const feeVoidSchema = z.object({ reason: z.string().trim().min(1, 'REQUIRED').max(200, 'Size') });
