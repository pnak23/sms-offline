<script setup lang="ts">
import { feesApi } from '~/services/feesApi';
import type { FeeCategory } from '~/types/api';
import { formatMoney } from '~/utils/money';
import { sortByKhmer } from '~/utils/sort';

// The fee categories of the school (monthly fee, books, exam fee ...). A category that is no longer used is deactivated, never deleted.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const categories = ref<FeeCategory[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const editing = ref<FeeCategory | null>(null);
const showForm = ref(false);
const busyId = ref<number | null>(null);

const sorted = computed(() => [...sortByKhmer(categories.value.filter((c) => c.active), (c) => c.nameKm), ...sortByKhmer(categories.value.filter((c) => !c.active), (c) => c.nameKm)]);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    categories.value = await feesApi.categories();
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

function openForm(category: FeeCategory | null): void {
  editing.value = category;
  showForm.value = true;
}

async function toggle(category: FeeCategory): Promise<void> {
  busyId.value = category.id;
  try {
    await feesApi.setCategoryActive(category.id, !category.active, category.version);
    notify.success(t(category.active ? 'fees.categoryDeactivated' : 'fees.categoryActivated'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busyId.value = null;
    await load();
  }
}

onMounted(load);
defineExpose({ reload: load });
</script>

<template>
  <div class="card mt-3" data-testid="fee-categories">
    <div class="card-body">
      <div class="d-flex align-items-center mb-3">
        <h2 class="h5 mb-0 me-auto">{{ t('fees.categoriesTitle') }}</h2>
        <button type="button" class="btn btn-primary btn-sm" @click="openForm(null)"><AppIcon name="plus-lg" />{{ t('fees.addCategory') }}</button>
      </div>
      <StateBlock :loading="loading" :error="loadError" @retry="load">
        <p v-if="categories.length === 0" class="text-muted mb-0">{{ t('fees.noCategories') }}</p>
        <div v-else class="table-responsive scroll-x">
          <table class="table align-middle mb-0">
            <thead>
              <tr>
                <th>{{ t('fees.categoryName') }}</th>
                <th class="text-end">{{ t('fees.defaultAmount') }}</th>
                <th>{{ t('common.status') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in sorted" :key="c.id" :data-category="c.nameKm">
                <td class="fw-medium">{{ c.nameKm }}</td>
                <td class="text-end">{{ c.defaultAmount > 0 ? formatMoney(c.defaultAmount, c.currency) : t('fees.askEachTime') }}</td>
                <td><span class="badge" :class="c.active ? 'text-bg-success' : 'text-bg-secondary'">{{ t(c.active ? 'fees.active' : 'fees.inactive') }}</span></td>
                <td class="text-end text-nowrap">
                  <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="busyId !== null" @click="openForm(c)"><AppIcon name="pencil" />{{ t('common.edit') }}</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm ms-1" :disabled="busyId !== null" @click="toggle(c)">{{ t(c.active ? 'fees.deactivate' : 'fees.activate') }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </StateBlock>
    </div>
    <FeeCategoryModal v-model="showForm" :category="editing" @saved="load" @stale="load" />
  </div>
</template>
