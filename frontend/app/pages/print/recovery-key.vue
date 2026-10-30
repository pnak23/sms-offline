<script setup lang="ts">
import { printCurrentPage, savePdfOfCurrentPage } from '~/services/desktop';
import { useRecoveryKeyStore } from '~/stores/recoveryKey';
import { useSchoolStore } from '~/stores/school';
import { formatLongDateKm } from '~/utils/date';

definePageMeta({ layout: 'print' });

const { t } = useI18n();
const store = useRecoveryKeyStore();
const school = useSchoolStore();
const notify = useNotify();
const busy = ref<'print' | 'pdf' | null>(null);

// A reload empties memory (by design): without a key there is nothing to print, so leave.
if (!store.hasKey) await navigateTo('/', { replace: true });

const groups = computed(() => (store.key ?? '').split('-'));
const issued = computed(() => formatLongDateKm(store.issuedAt ?? new Date()));

async function back(): Promise<void> {
  await navigateTo(store.returnTo, { replace: true });
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
    const result = await savePdfOfCurrentPage('recovery-key.pdf');
    if (result.saved) notify.success(t('print.pdfSaved'));
  } catch {
    notify.error(t('print.failed'));
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div v-if="store.hasKey">
    <div class="print-toolbar no-print">
      <button type="button" class="btn btn-outline-secondary" @click="back"><AppIcon name="arrow-left" />{{ t('common.back') }}</button>
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null" @click="savePdf">
        {{ t('print.savePdf') }}
      </LoadingButton>
    </div>

    <article class="print-sheet key-sheet" lang="km">
      <p v-if="school.hasName" class="key-sheet-school">{{ school.name }}</p>
      <h1 class="key-sheet-title">{{ t('print.recoveryKey.title') }}</h1>

      <div class="key-sheet-key" :aria-label="t('recovery.keyLabel')">
        <span v-for="(group, index) in groups" :key="index">{{ group }}</span>
      </div>

      <p class="key-sheet-note">{{ t('print.recoveryKey.keepSafe') }}</p>
      <ul class="key-sheet-rules">
        <li>{{ t('print.recoveryKey.ruleOnce') }}</li>
        <li>{{ t('print.recoveryKey.ruleAnyone') }}</li>
        <li>{{ t('print.recoveryKey.ruleNewKey') }}</li>
      </ul>

      <div class="key-sheet-footer">
        <div>{{ t('print.recoveryKey.date', { date: issued }) }}</div>
        <div class="key-sheet-signature">
          <span class="signature-line" />
          <span>{{ t('print.recoveryKey.signature') }}</span>
        </div>
      </div>
    </article>
  </div>
</template>
