<script setup lang="ts">
import { feesApi } from '~/services/feesApi';
import type { FeeCategory, FeeCharge, FeeLedger, FeePayment } from '~/types/api';
import { formatDateKm } from '~/utils/date';
import { formatMoney } from '~/utils/money';

// One student's fee account: every charge with the payments made against it. Payments are never deleted — a mistake is voided with a reason,
// and each payment has a receipt that can be printed (a voided one prints marked void).
const { t } = useI18n();
const route = useRoute();
const { messageFor } = useApiError();
const notify = useNotify();

const id = Number(route.params.enrollmentId);
const ledger = ref<FeeLedger | null>(null);
const categories = ref<FeeCategory[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const chargeModal = ref(false);
const editing = ref<FeeCharge | null>(null);
const payModal = ref(false);
const payTarget = ref<FeeCharge | null>(null);
const voidModal = ref(false);
const voidTarget = ref<FeePayment | null>(null);
const deleteTarget = ref<FeeCharge | null>(null);
const deleting = ref(false);
const deleteOpen = computed({
  get: () => deleteTarget.value !== null,
  set: (open) => {
    if (!open) deleteTarget.value = null;
  },
});

const frozen = computed(() => !ledger.value || ledger.value.yearClosed);
const canCharge = computed(() => !!ledger.value && !ledger.value.yearClosed && ledger.value.enrollmentActive && categories.value.some((c) => c.active));
const method = (code: string): string => t(`fees.method.${code}`);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    [ledger.value, categories.value] = await Promise.all([feesApi.ledger(id), feesApi.categories()]);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

function addCharge(): void {
  editing.value = null;
  chargeModal.value = true;
}

function editCharge(charge: FeeCharge): void {
  editing.value = charge;
  chargeModal.value = true;
}

function pay(charge: FeeCharge): void {
  payTarget.value = charge;
  payModal.value = true;
}

function voidPayment(payment: FeePayment): void {
  voidTarget.value = payment;
  voidModal.value = true;
}

async function removeCharge(): Promise<void> {
  const target = deleteTarget.value;
  if (!target) return;
  deleting.value = true;
  try {
    await feesApi.deleteCharge(target.id);
    notify.success(t('fees.chargeDeleted'));
    await load();
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    deleting.value = false;
    deleteTarget.value = null;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="ledger?.nameKm ?? t('fees.title')" :subtitle="ledger ? `${ledger.studentCode} · ${ledger.gradeName} ${ledger.className} · ${ledger.yearName}` : undefined">
      <NuxtLink to="/fees" class="btn btn-outline-secondary"><AppIcon name="arrow-left" />{{ t('common.back') }}</NuxtLink>
      <NuxtLink v-if="ledger" :to="`/students/${ledger.studentId}`" class="btn btn-outline-secondary"><AppIcon name="mortarboard" />{{ t('fees.studentProfile') }}</NuxtLink>
      <button type="button" class="btn btn-primary" :disabled="!canCharge" @click="addCharge"><AppIcon name="plus-lg" />{{ t('fees.addCharge') }}</button>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <template v-if="ledger">
        <p v-if="ledger.yearClosed" class="text-muted">{{ t('fees.ledgerYearClosed') }}</p>
        <p v-else-if="!ledger.enrollmentActive" class="text-muted">{{ t('fees.enrollmentEnded') }}</p>

        <div class="card mb-3">
          <div class="card-body d-flex flex-wrap gap-4" data-testid="ledger-totals">
            <div v-if="ledger.totals.length === 0" class="text-muted">{{ t('fees.noCharges') }}</div>
            <div v-for="total in ledger.totals" :key="total.currency">
              <div class="small text-muted">{{ t('fees.due') }}</div>
              <div class="fs-5 fw-semibold">{{ formatMoney(total.due, total.currency) }}</div>
            </div>
            <div v-for="total in ledger.totals" :key="`p-${total.currency}`">
              <div class="small text-muted">{{ t('fees.paid') }}</div>
              <div class="fs-5 fw-semibold">{{ formatMoney(total.paid, total.currency) }}</div>
            </div>
            <div v-for="total in ledger.totals" :key="`b-${total.currency}`">
              <div class="small text-muted">{{ t('fees.balance') }}</div>
              <div class="fs-5 fw-semibold" :class="{ 'text-danger': total.balance > 0 }" data-testid="ledger-balance">{{ formatMoney(total.balance, total.currency) }}</div>
            </div>
          </div>
        </div>

        <div v-if="ledger.charges.length > 0" class="card">
          <div class="card-body table-responsive scroll-x">
            <table class="table align-middle mb-0" data-testid="charges-table">
              <thead>
                <tr>
                  <th>{{ t('fees.category') }}</th>
                  <th>{{ t('fees.dueDate') }}</th>
                  <th class="text-end">{{ t('fees.due') }}</th>
                  <th class="text-end">{{ t('fees.paid') }}</th>
                  <th class="text-end">{{ t('fees.balance') }}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <template v-for="c in ledger.charges" :key="c.id">
                  <tr class="table-light" :data-charge="c.categoryName">
                    <td class="fw-medium">{{ c.categoryName }}<div v-if="c.note" class="small text-muted">{{ c.note }}</div></td>
                    <td class="text-nowrap">{{ c.dueDate ? formatDateKm(c.dueDate) : '—' }}</td>
                    <td class="text-end">{{ formatMoney(c.amountDue, c.currency) }}</td>
                    <td class="text-end">{{ formatMoney(c.paid, c.currency) }}</td>
                    <td class="text-end" :class="{ 'text-danger fw-semibold': c.balance > 0 }">{{ formatMoney(c.balance, c.currency) }}</td>
                    <td class="text-end text-nowrap">
                      <button type="button" class="btn btn-primary btn-sm" :disabled="c.balance <= 0" @click="pay(c)"><AppIcon name="cash-coin" />{{ t('fees.pay') }}</button>
                      <button type="button" class="btn btn-outline-secondary btn-sm ms-1" :disabled="frozen" :aria-label="t('common.edit')" :title="t('common.edit')" @click="editCharge(c)"><AppIcon name="pencil" /></button>
                      <button type="button" class="btn btn-outline-danger btn-sm ms-1" :disabled="frozen || c.payments.length > 0" :aria-label="t('common.delete')" :title="c.payments.length > 0 ? t('fees.cannotDelete') : t('common.delete')" @click="deleteTarget = c">
                        <AppIcon name="trash" />
                      </button>
                    </td>
                  </tr>
                  <tr v-for="p in c.payments" :key="p.id" :data-receipt="p.receiptNo" :class="{ 'text-muted': p.voided }">
                    <td class="ps-4" colspan="2">
                      <span :class="{ 'text-decoration-line-through': p.voided }">{{ p.receiptNo }}</span>
                      <span v-if="p.voided" class="badge text-bg-danger ms-2">{{ t('fees.voided') }}</span>
                      <div class="small">{{ formatDateKm(p.paidOn) }} · {{ method(p.method) }}<template v-if="p.reference"> · {{ p.reference }}</template></div>
                      <div v-if="p.voided" class="small">{{ t('fees.voidReason') }}: {{ p.voidReason }}</div>
                    </td>
                    <td />
                    <td class="text-end" :class="{ 'text-decoration-line-through': p.voided }">{{ formatMoney(p.amount, p.currency) }}</td>
                    <td />
                    <td class="text-end text-nowrap">
                      <NuxtLink :to="`/print/receipt/${p.id}`" class="btn btn-outline-secondary btn-sm"><AppIcon name="printer" />{{ t('fees.receipt') }}</NuxtLink>
                      <button v-if="!p.voided" type="button" class="btn btn-outline-danger btn-sm ms-1" @click="voidPayment(p)">{{ t('fees.void') }}</button>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </StateBlock>

    <FeeChargeModal v-model="chargeModal" :enrollment-id="id" :charge="editing" :categories="categories" @saved="load" @stale="load" />
    <FeePaymentModal v-model="payModal" :charge="payTarget" @saved="load" @stale="load" />
    <FeeVoidModal v-model="voidModal" :payment="voidTarget" @saved="load" @stale="load" />
    <ConfirmModal v-model="deleteOpen" :title="t('fees.deleteChargeTitle')" :message="t('fees.deleteChargeMessage', { category: deleteTarget?.categoryName ?? '' })" :confirm-label="t('common.delete')" :loading="deleting" @confirm="removeCharge" />
  </div>
</template>
