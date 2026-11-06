<script setup lang="ts">
import { printCurrentPage, savePdfOfCurrentPage } from '~/services/desktop';
import { feesApi } from '~/services/feesApi';
import type { FeeReceipt } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { formatMoney } from '~/utils/money';

// The receipt of one payment (A4, the top part of the page). A voided payment prints marked VOID with its reason: the number stays on record.
definePageMeta({ layout: 'print' });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const notify = useNotify();
const { messageFor } = useApiError();

const id = Number(route.params.id);
const receipt = ref<FeeReceipt | null>(null);
const error = ref<string | null>(null);
const busy = ref<'print' | 'pdf' | null>(null);

const payment = computed(() => receipt.value?.payment ?? null);

onMounted(async () => {
  try {
    receipt.value = await feesApi.receipt(id);
  } catch (e) {
    error.value = messageFor(e);
  }
});

function back(): void {
  router.back();   // the student's account the receipt was opened from
}

async function print(): Promise<void> {
  busy.value = 'print';
  try {
    await printCurrentPage();
  } catch {
    notify.error(t('print.failed'));
  } finally {
    busy.value = null;
  }
}

async function savePdf(): Promise<void> {
  busy.value = 'pdf';
  try {
    const result = await savePdfOfCurrentPage(`${payment.value?.receiptNo ?? 'receipt'}.pdf`);
    if (result.saved) notify.success(t('print.pdfSaved'));
  } catch {
    notify.error(t('print.failed'));
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div>
    <div class="print-toolbar no-print">
      <button type="button" class="btn btn-outline-secondary" @click="back"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null || !receipt" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null || !receipt" @click="savePdf">{{ t('print.savePdf') }}</LoadingButton>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <article v-if="receipt && payment" class="print-sheet student-sheet receipt-sheet" lang="km" data-testid="receipt-sheet">
      <PrintHeader />
      <h1 class="student-sheet-title">{{ t('fees.receiptTitle') }}</h1>
      <p v-if="payment.voided" class="receipt-void" data-testid="receipt-void">{{ t('fees.voidedStamp') }}</p>

      <table class="student-sheet-table">
        <tbody>
          <tr><th>{{ t('fees.receiptNo') }}</th><td class="fw-semibold">{{ payment.receiptNo }}</td></tr>
          <tr><th>{{ t('fees.paidOn') }}</th><td>{{ formatDateKm(payment.paidOn) }}</td></tr>
          <tr><th>{{ t('students.nameKm') }}</th><td class="fw-semibold">{{ receipt.studentNameKm }}</td></tr>
          <tr><th>{{ t('students.code') }}</th><td>{{ receipt.studentCode }}</td></tr>
          <tr><th>{{ t('students.class') }}</th><td>{{ receipt.gradeName }} {{ receipt.className }} · {{ receipt.yearName }}</td></tr>
          <tr><th>{{ t('fees.category') }}</th><td>{{ receipt.categoryName }}</td></tr>
          <tr><th>{{ t('fees.amountPaid') }}</th><td class="fw-semibold fs-5">{{ formatMoney(payment.amount, payment.currency) }}</td></tr>
          <tr><th>{{ t('fees.methodLabel') }}</th><td>{{ t(`fees.method.${payment.method}`) }}<template v-if="payment.reference"> · {{ payment.reference }}</template></td></tr>
          <tr><th>{{ t('fees.due') }}</th><td>{{ formatMoney(receipt.amountDue, payment.currency) }}</td></tr>
          <tr><th>{{ t('fees.balanceAfter') }}</th><td>{{ formatMoney(receipt.balanceAfter, payment.currency) }}</td></tr>
          <tr v-if="payment.voided"><th>{{ t('fees.voidReason') }}</th><td>{{ payment.voidReason }}</td></tr>
        </tbody>
      </table>

      <footer class="student-sheet-footer">
        <div class="student-sheet-signature">
          <span class="signature-line" />
          <span>{{ t('fees.payerSignature') }}</span>
        </div>
        <div class="student-sheet-signature">
          <span class="signature-line" />
          <span>{{ t('fees.cashierSignature') }}</span>
        </div>
      </footer>
    </article>
  </div>
</template>
