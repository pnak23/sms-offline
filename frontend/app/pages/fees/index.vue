<script setup lang="ts">
import { feesApi } from '~/services/feesApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { FeeCategory, FeeClassSummary, FeeTotal } from '~/types/api';
import { formatMoney } from '~/utils/money';
import { sortByKhmer } from '~/utils/sort';

// School fees by class: what each student owes, has paid and still owes. A row opens the student's account (charges, payments, receipts).
const { t } = useI18n();
const { messageFor } = useApiError();
const preferences = usePreferencesStore();

const { years, classes, yearId, classId, schoolClass, closed, loading: pickerLoading, error: pickerError, load: loadPicker } = useClassPicker();
const summary = ref<FeeClassSummary | null>(null);
const categories = ref<FeeCategory[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const showClassCharge = ref(false);

const rows = computed(() => sortByKhmer(summary.value?.rows ?? [], (r) => r.nameKm));
const className = computed(() => (schoolClass.value ? `${schoolClass.value.gradeName} ${schoolClass.value.nameKm}` : ''));
const hasCategories = computed(() => categories.value.some((c) => c.active));

/** One line per currency for a column ("15,000៛", "$12.50"); a dash when the student has no fee at all. */
const amounts = (totals: FeeTotal[], field: 'due' | 'paid' | 'balance'): string[] => (totals.length === 0 ? ['—'] : totals.map((x) => formatMoney(x[field], x.currency)));
const owes = (totals: FeeTotal[]): boolean => totals.some((x) => x.balance > 0);

async function loadSummary(): Promise<void> {
  summary.value = null;
  loadError.value = null;
  if (classId.value === null || !preferences.feesEnabled) return;
  const target = classId.value;
  loading.value = true;
  try {
    const found = await feesApi.classSummary(target);
    if (classId.value === target) summary.value = found;
  } catch (raised) {
    loadError.value = messageFor(raised);
  } finally {
    loading.value = false;
  }
}

async function load(): Promise<void> {
  await loadPicker();
  if (preferences.feesEnabled) {
    try {
      categories.value = await feesApi.categories();
    } catch (raised) {
      loadError.value = messageFor(raised);
    }
  }
  await loadSummary();
}

watch(classId, loadSummary);
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('fees.title')" :subtitle="t('fees.subtitle')">
      <NuxtLink v-if="classId !== null && preferences.feesEnabled" :to="`/print/report?name=fees&classId=${classId}`" class="btn btn-outline-secondary"><AppIcon name="printer" />{{ t('fees.printReport') }}</NuxtLink>
      <button v-if="preferences.feesEnabled" type="button" class="btn btn-primary" :disabled="classId === null || closed || !hasCategories" @click="showClassCharge = true"><AppIcon name="plus-lg" />{{ t('fees.chargeClass') }}</button>
    </PageHeader>

    <div class="card">
      <div class="card-body">
        <p v-if="!preferences.feesEnabled" class="mb-0">
          {{ t('fees.switchedOff') }} <NuxtLink to="/settings/fees">{{ t('nav.feeSettings') }}</NuxtLink>
        </p>
        <StateBlock v-else :loading="pickerLoading" :error="pickerError" @retry="load">
          <p v-if="years.length === 0" class="mb-0">{{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink></p>
          <template v-else>
            <div class="filter-bar"><ClassPicker v-model:year-id="yearId" v-model:class-id="classId" :years="years" :classes="classes" /></div>
            <p v-if="closed" class="text-muted">{{ t('fees.yearClosed') }}</p>
            <p v-if="!hasCategories" class="text-muted">{{ t('fees.noActiveCategory') }} <NuxtLink to="/settings/fees">{{ t('nav.feeSettings') }}</NuxtLink></p>

            <StateBlock :loading="loading" :error="loadError" @retry="loadSummary">
              <p v-if="classId === null" class="text-muted mb-0">{{ t('attendance.chooseClass') }}</p>
              <p v-else-if="rows.length === 0" class="text-muted mb-0">{{ t('attendance.noStudents') }}</p>
              <div v-else class="table-responsive scroll-x">
                <table class="table table-hover align-middle mb-0" data-testid="fees-table">
                  <thead>
                    <tr>
                      <th>{{ t('students.code') }}</th>
                      <th>{{ t('students.nameKm') }}</th>
                      <th class="text-end">{{ t('fees.due') }}</th>
                      <th class="text-end">{{ t('fees.paid') }}</th>
                      <th class="text-end">{{ t('fees.balance') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in rows" :key="row.enrollmentId" :data-student="row.studentCode">
                      <td class="text-nowrap">{{ row.studentCode }}</td>
                      <td class="fw-medium"><NuxtLink :to="`/fees/${row.enrollmentId}`">{{ row.nameKm }}</NuxtLink></td>
                      <td class="text-end"><div v-for="(a, i) in amounts(row.totals, 'due')" :key="i">{{ a }}</div></td>
                      <td class="text-end"><div v-for="(a, i) in amounts(row.totals, 'paid')" :key="i">{{ a }}</div></td>
                      <td class="text-end" :class="{ 'text-danger fw-semibold': owes(row.totals) }"><div v-for="(a, i) in amounts(row.totals, 'balance')" :key="i">{{ a }}</div></td>
                    </tr>
                  </tbody>
                  <tfoot v-if="summary && summary.totals.length > 0">
                    <tr class="fw-semibold">
                      <td colspan="2">{{ t('fees.classTotal') }}</td>
                      <td class="text-end"><div v-for="(a, i) in amounts(summary.totals, 'due')" :key="i">{{ a }}</div></td>
                      <td class="text-end"><div v-for="(a, i) in amounts(summary.totals, 'paid')" :key="i">{{ a }}</div></td>
                      <td class="text-end"><div v-for="(a, i) in amounts(summary.totals, 'balance')" :key="i" data-testid="class-balance">{{ a }}</div></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </StateBlock>
          </template>
        </StateBlock>
      </div>
    </div>

    <FeeClassChargeModal v-if="classId !== null" v-model="showClassCharge" :class-id="classId" :class-name="className" :categories="categories" @saved="loadSummary" @stale="load" />
  </div>
</template>
