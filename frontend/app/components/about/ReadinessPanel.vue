<script setup lang="ts">
import { acceptanceApi } from '~/services/acceptanceApi';
import { useAcceptanceStore } from '~/stores/acceptance';
import type { AcceptanceItem } from '~/types/api';
import { formatDateTimeKm } from '~/utils/date';
import { stateOf, stateVariant } from '~/utils/acceptance';

// What is still pending before the school accepts the system, kept apart in the five states the owner asked for. The first four come
// with the program; the fifth, "final school acceptance completed", exists only when the administrator signs an item off here.
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();
const acceptance = useAcceptanceStore();

const signing = ref<AcceptanceItem | null>(null);
const showSign = ref(false);
const busyId = ref<string | null>(null);
const loadError = ref<string | null>(null);

const groups = computed(() => [
  { id: 'information', items: acceptance.items.filter((i) => i.group === 'information') },
  { id: 'hardware', items: acceptance.items.filter((i) => i.group === 'hardware') },
]);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    await acceptance.load();
  } catch (error) {
    loadError.value = messageFor(error);
  }
}

function askSign(item: AcceptanceItem): void {
  signing.value = item;
  showSign.value = true;
}

async function withdraw(item: AcceptanceItem): Promise<void> {
  busyId.value = item.id;
  try {
    await acceptanceApi.withdraw(item.id);
    await acceptance.load();
    notify.success(t('acceptance.withdrawn'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busyId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="card mt-3" data-testid="readiness">
    <div class="card-body">
      <h2 class="h5">{{ t('acceptance.title') }}</h2>
      <p class="text-muted">{{ t('acceptance.subtitle') }}</p>

      <StateBlock :loading="!acceptance.loaded && !loadError" :error="loadError" @retry="load">
        <div class="readiness-chips" data-testid="readiness-summary">
          <span class="badge text-bg-success" data-state="development"><strong>{{ acceptance.summary.developmentCompleted }}</strong>/{{ acceptance.summary.total }} {{ t('acceptance.summary.development') }}</span>
          <span class="badge text-bg-info" data-state="configuration"><strong>{{ acceptance.summary.configurationPending }}</strong> {{ t('acceptance.state.CONFIGURATION_PENDING') }}</span>
          <span class="badge text-bg-warning" data-state="information"><strong>{{ acceptance.summary.officialInformationPending }}</strong> {{ t('acceptance.state.OFFICIAL_INFORMATION_PENDING') }}</span>
          <span class="badge text-bg-secondary" data-state="physical"><strong>{{ acceptance.summary.physicalTestingPending }}</strong> {{ t('acceptance.state.PHYSICAL_TESTING_PENDING') }}</span>
          <span class="badge text-bg-primary" data-state="final"><strong>{{ acceptance.summary.finalAccepted }}</strong>/{{ acceptance.summary.total }} {{ t('acceptance.state.FINAL_ACCEPTANCE_COMPLETED') }}</span>
        </div>

        <template v-for="group in groups" :key="group.id">
          <h3 class="h6 mt-4">{{ t(`acceptance.group.${group.id}`) }}</h3>
          <div class="table-responsive scroll-x">
            <table class="table align-middle mb-0">
              <thead>
                <tr>
                  <th>{{ t('acceptance.col.item') }}</th>
                  <th>{{ t('acceptance.col.development') }}</th>
                  <th>{{ t('acceptance.col.state') }}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in group.items" :key="item.id" :data-testid="`acceptance-row-${item.id}`" :data-state="stateOf(item)">
                  <td>
                    <div class="fw-medium">{{ t(`acceptance.item.${item.id}.title`) }}</div>
                    <div class="text-muted small">{{ t(`acceptance.item.${item.id}.closes`) }}</div>
                    <div v-if="item.signOff" class="small text-success-emphasis" data-testid="signoff-info">
                      {{ t('acceptance.signedBy', { name: item.signOff.signedBy, date: formatDateTimeKm(item.signOff.at) }) }}<span v-if="item.signOff.note"> — {{ item.signOff.note }}</span>
                    </div>
                  </td>
                  <td>
                    <span class="badge" :class="item.development === 'COMPLETED' ? 'text-bg-success' : 'text-bg-secondary'">{{ t(`acceptance.development.${item.development}`) }}</span>
                  </td>
                  <td><span class="badge" :class="`text-bg-${stateVariant(stateOf(item))}`">{{ t(`acceptance.state.${stateOf(item)}`) }}</span></td>
                  <td class="text-end text-nowrap">
                    <button v-if="!item.signOff" type="button" class="btn btn-outline-primary btn-sm" :disabled="item.development !== 'COMPLETED' || busyId !== null" :title="item.development !== 'COMPLETED' ? t('acceptance.notReady') : undefined" :data-testid="`signoff-${item.id}`" @click="askSign(item)">
                      {{ t('acceptance.signOff') }}
                    </button>
                    <button v-else type="button" class="btn btn-outline-secondary btn-sm" :disabled="busyId !== null" :data-testid="`withdraw-${item.id}`" @click="withdraw(item)">
                      {{ t('acceptance.withdraw') }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </StateBlock>
    </div>
    <SignOffModal v-model="showSign" :item="signing" />
  </div>
</template>
