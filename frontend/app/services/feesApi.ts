import type { FeeCategory, FeeChargeResult, FeeCharge, FeeClassSummary, FeeCurrency, FeeLedger, FeePayment, FeeReceipt, PaymentMethod } from '../types/api';
import { queryString } from '../utils/query';
import { http } from './http';

export interface FeeCategoryInput {
  nameKm: string;
  defaultAmount: number | null;
  currency: FeeCurrency;
}

export interface FeeChargeInput {
  categoryId: number;
  /** null = the category's default amount. */
  amount: number | null;
  dueDate: string | null;
  note: string | null;
}

export interface FeePaymentInput {
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
}

// Every call answers 409 FEES_DISABLED while fees are switched off in Settings.
export const feesApi = {
  categories: () => http.get<FeeCategory[]>('/fees/categories'),

  createCategory: (input: FeeCategoryInput) => http.post<FeeCategory>('/fees/categories', input),

  updateCategory: (id: number, input: FeeCategoryInput, version: number) => http.put<FeeCategory>(`/fees/categories/${id}`, { ...input, version }),

  setCategoryActive: (id: number, active: boolean, version: number) => http.put<FeeCategory>(`/fees/categories/${id}/active`, { active, version }),

  /** Per student of the class: what is owed, paid and still due, per currency. */
  classSummary: (classId: number) => http.get<FeeClassSummary>(`/fees/class${queryString({ classId })}`),

  ledger: (enrollmentId: number) => http.get<FeeLedger>(`/fees/enrollments/${enrollmentId}`),

  charge: (enrollmentId: number, input: FeeChargeInput) => http.post<FeeCharge>('/fees/charges', { enrollmentId, ...input }),

  /** The same charge for every student in the class; whoever already has it (same category and due date) is skipped. */
  chargeClass: (classId: number, input: FeeChargeInput) => http.post<FeeChargeResult>('/fees/charges/class', { classId, ...input }),

  updateCharge: (id: number, input: { amount: number; dueDate: string | null; note: string | null }, version: number) =>
    http.put<FeeCharge>(`/fees/charges/${id}`, { ...input, version }),

  /** Only a charge nobody ever paid. */
  deleteCharge: (id: number) => http.delete<void>(`/fees/charges/${id}`),

  pay: (chargeId: number, input: FeePaymentInput) => http.post<FeePayment>(`/fees/charges/${chargeId}/payments`, input),

  /** A payment is never deleted: a mistake is voided with a reason and the receipt number stays on record. */
  voidPayment: (id: number, reason: string) => http.post<FeePayment>(`/fees/payments/${id}/void`, { reason }),

  receipt: (paymentId: number) => http.get<FeeReceipt>(`/fees/payments/${paymentId}/receipt`),
};
