<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';

// School fees are optional. Switched on here they add the Fees pages, a figure on the dashboard and a fee report; switched off again they
// are only hidden — nothing that was recorded is lost. Until the school says otherwise, fees are in riel (KHR).
const { t } = useI18n();
const notify = useNotify();
const { failureText } = useApiError();
const preferences = usePreferencesStore();

const saving = ref(false);
const error = ref<string | null>(null);
const currencies = ref('KHR');
const defaultCurrency = ref('KHR');
// the allowed currencies as the school chose them (the list in the store puts the preferred one first, which is not what the choice box shows)
const allowedText = (): string => (preferences.values['fees.currencies'] ?? 'KHR');

watch(() => preferences.loaded, () => { currencies.value = allowedText(); defaultCurrency.value = preferences.feeDefaultCurrency; }, { immediate: true });

async function change(values: Record<string, string>, doneKey: string): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    await preferences.save(values);
    notify.success(t(doneKey));
  } catch (raised) {
    error.value = failureText(raised);
    currencies.value = allowedText();
    defaultCurrency.value = preferences.feeDefaultCurrency;
  } finally {
    saving.value = false;
  }
}

const toggle = (event: Event): Promise<void> => change({ 'fees.enabled': String((event.target as HTMLInputElement).checked) }, 'fees.settingsSaved');
</script>

<template>
  <div class="page-container is-form">
    <PageHeader :title="t('fees.settingsTitle')" :subtitle="t('fees.settingsSubtitle')" />
    <DraftNotice item="fee-currency" text-key="acceptance.draft.feeCurrency" />
    <div class="card">
      <div class="card-body">
        <FormAlert :message="error" />
        <div class="form-check form-switch mb-1">
          <input id="fees-enabled" type="checkbox" class="form-check-input" role="switch" :checked="preferences.feesEnabled" :disabled="saving" @change="toggle" />
          <label for="fees-enabled" class="form-check-label">{{ t('fees.enable') }}</label>
        </div>
        <p class="form-text">{{ t('fees.enableHint') }}</p>

        <template v-if="preferences.feesEnabled">
          <label for="fees-currencies" class="form-label">{{ t('fees.currenciesLabel') }}</label>
          <select id="fees-currencies" v-model="currencies" class="form-select w-auto" :disabled="saving" @change="change({ 'fees.currencies': currencies }, 'fees.settingsSaved')">
            <option value="KHR">{{ t('fees.currency.KHR') }}</option>
            <option value="USD">{{ t('fees.currency.USD') }}</option>
            <option value="KHR,USD">{{ t('fees.currency.BOTH') }}</option>
          </select>
          <p class="form-text">{{ t('fees.currenciesHint') }}</p>

          <template v-if="currencies === 'KHR,USD'">
            <label for="fees-default-currency" class="form-label">{{ t('fees.defaultCurrencyLabel') }}</label>
            <select id="fees-default-currency" v-model="defaultCurrency" class="form-select w-auto" :disabled="saving" data-testid="fees-default-currency" @change="change({ 'fees.defaultCurrency': defaultCurrency }, 'fees.settingsSaved')">
              <option value="KHR">{{ t('fees.currency.KHR') }}</option>
              <option value="USD">{{ t('fees.currency.USD') }}</option>
            </select>
            <p class="form-text">{{ t('fees.defaultCurrencyHint') }}</p>
          </template>
        </template>
      </div>
    </div>
    <FeeCategoriesCard v-if="preferences.feesEnabled" />
  </div>
</template>
