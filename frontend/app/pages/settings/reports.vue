<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';
import { asciiDigitsToKhmer } from '~/utils/khmer';

// What every printed report and report card shares: Khmer digits instead of Arabic ones, and the national / ministry lines above the
// school's name. Both are off until switched on here; the wording of the three lines can be changed.
const { t } = useI18n();
const notify = useNotify();
const { failureText } = useApiError();
const preferences = usePreferencesStore();

const numerals = ref(false);
const header = ref(false);
const lines = reactive(['', '', '']);
const saving = ref(false);
const error = ref<string | null>(null);

function fill(): void {
  numerals.value = preferences.khmerNumerals;
  header.value = preferences.moeysHeader;
  ['report.headerLine1', 'report.headerLine2', 'report.headerLine3'].forEach((key, i) => {
    lines[i] = preferences.values[key] ?? '';
  });
}

const previewLines = computed(() => lines.map((l) => l.trim()).filter((l) => l !== ''));
const sample = computed(() => (numerals.value ? asciiDigitsToKhmer('2026-0001 · 31 / 10 / 2026') : '2026-0001 · 31 / 10 / 2026'));

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    await preferences.save({
      'report.khmerNumerals': String(numerals.value),
      'report.moeysHeader': String(header.value),
      'report.headerLine1': lines[0] ?? '',
      'report.headerLine2': lines[1] ?? '',
      'report.headerLine3': lines[2] ?? '',
    });
    notify.success(t('reportOptions.saved'));
  } catch (raised) {
    error.value = failureText(raised);
  } finally {
    saving.value = false;
  }
}

watch(() => preferences.loaded, fill, { immediate: true });
</script>

<template>
  <div class="page-container is-form">
    <PageHeader :title="t('reportOptions.title')" :subtitle="t('reportOptions.subtitle')" />
    <DraftNotice item="national-header" text-key="acceptance.draft.nationalHeader" />
    <div class="card">
      <div class="card-body">
        <FormAlert :message="error" />
        <form novalidate @submit.prevent="save">
          <h2 class="h5">{{ t('reportOptions.numeralsTitle') }}</h2>
          <div class="form-check form-switch mb-1">
            <input id="opt-numerals" v-model="numerals" type="checkbox" class="form-check-input" role="switch" />
            <label for="opt-numerals" class="form-check-label">{{ t('reportOptions.numerals') }}</label>
          </div>
          <p class="form-text">{{ t('reportOptions.numeralsHint') }} <span class="fw-medium" data-testid="numerals-sample">{{ sample }}</span></p>

          <h2 class="h5 mt-4">{{ t('reportOptions.headerTitle') }}</h2>
          <div class="form-check form-switch mb-1">
            <input id="opt-header" v-model="header" type="checkbox" class="form-check-input" role="switch" />
            <label for="opt-header" class="form-check-label">{{ t('reportOptions.header') }}</label>
          </div>
          <p class="form-text">{{ t('reportOptions.headerHint') }}</p>
          <div v-for="(_, i) in lines" :key="i" class="mb-3">
            <label :for="`opt-line-${i + 1}`" class="form-label">{{ t('reportOptions.line', { n: i + 1 }) }}</label>
            <input :id="`opt-line-${i + 1}`" v-model="lines[i]" class="form-control" maxlength="100" autocomplete="off" />
          </div>
          <div v-if="header && previewLines.length > 0" class="print-national report-preview mb-3" data-testid="header-preview">
            <p v-for="(line, i) in previewLines" :key="i" :class="i === 0 ? 'print-national-main' : 'print-national-sub'">{{ line }}</p>
          </div>

          <LoadingButton type="submit" icon="check-lg" :loading="saving">{{ t('common.save') }}</LoadingButton>
        </form>
      </div>
    </div>
  </div>
</template>
