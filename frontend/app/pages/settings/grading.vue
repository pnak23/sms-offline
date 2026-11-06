<script setup lang="ts">
import { gradingApi } from '~/services/gradingApi';
import type { GradingScale } from '~/types/api';
import { formatNumber } from '~/utils/score';

// Grading scales: the grade bands (letter and Khmer label from a percentage) and the pass mark. The default scale is the one
// results and report cards use. These are the standard bands until the school gives its own rules (docs/PHASE3-PROGRESS.md).
const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const scales = ref<GradingScale[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const editing = ref<GradingScale | null>(null);
const showForm = ref(false);
const makingDefault = ref<number | null>(null);

const defaultScale = computed(() => scales.value.find((s) => s.isDefault) ?? scales.value[0] ?? null);

async function load(): Promise<void> {
  loadError.value = null;
  try {
    scales.value = await gradingApi.list();
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

function openForm(scale: GradingScale | null): void {
  editing.value = scale;
  showForm.value = true;
}

async function makeDefault(scale: GradingScale): Promise<void> {
  makingDefault.value = scale.id;
  try {
    await gradingApi.setDefault(scale.id);
    notify.success(t('grading.defaultChanged'));
    await load();
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    makingDefault.value = null;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <DraftNotice item="grading-rules" text-key="acceptance.draft.gradingRules" />
    <PageHeader :title="t('grading.title')" :subtitle="t('grading.subtitle')">
      <button type="button" class="btn btn-primary" @click="openForm(null)"><AppIcon name="plus-lg" />{{ t('grading.add') }}</button>
    </PageHeader>

    <StateBlock :loading="loading" :error="loadError" @retry="load">
      <p class="text-muted" data-testid="grading-version-note">{{ t('grading.versionNote') }}</p>
      <div v-for="scale in scales" :key="scale.id" class="card mb-3" :data-scale="scale.nameKm">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-start gap-2 mb-3">
            <div class="me-auto">
              <h2 class="h5 mb-1">
                {{ scale.nameKm }}
                <span v-if="scale.isDefault" class="badge text-bg-success ms-2">{{ t('grading.default') }}</span>
              </h2>
              <p class="text-muted mb-0">{{ t('grading.passMarkIs', { percent: formatNumber(scale.passPercent) }) }}</p>
            </div>
            <LoadingButton v-if="!scale.isDefault" variant="outline-primary" icon="check-lg" :loading="makingDefault === scale.id" :disabled="makingDefault !== null" @click="makeDefault(scale)">
              {{ t('grading.makeDefault') }}
            </LoadingButton>
            <button type="button" class="btn btn-outline-secondary" @click="openForm(scale)"><AppIcon name="pencil" />{{ t('common.edit') }}</button>
          </div>
          <div class="table-responsive scroll-x">
            <table class="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>{{ t('grading.letter') }}</th>
                  <th>{{ t('grading.label') }}</th>
                  <th class="text-end">{{ t('grading.fromPercent') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="band in scale.bands" :key="band.minPercent">
                  <td class="fw-semibold">{{ band.letter }}</td>
                  <td>{{ band.labelKm }}</td>
                  <td class="text-end">{{ formatNumber(band.minPercent) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </StateBlock>

    <GradingScaleModal v-model="showForm" :scale="editing" :template="defaultScale" @saved="load" @stale="load" />
  </div>
</template>
