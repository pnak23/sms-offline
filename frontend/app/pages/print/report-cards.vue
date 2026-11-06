<script setup lang="ts">
import { printCurrentPage, savePdfOfCurrentPage } from '~/services/desktop';
import { reportCardsApi } from '~/services/reportCardsApi';
import { studentsApi } from '~/services/studentsApi';
import { usePreferencesStore } from '~/stores/preferences';
import type { ReportCard } from '~/types/api';
import { sortByKhmer } from '~/utils/sort';

// The printable report cards (A4): one card per student, one per page. What a card has (logo, photo, rank, attendance, comment, how many
// signature boxes, a closing note) is the school's choice in Settings → Report card; the card itself is components/print/ReportCardSheet.vue.
definePageMeta({ layout: 'print' });

const { t } = useI18n();
const route = useRoute();
const preferences = usePreferencesStore();
const notify = useNotify();
const { messageFor } = useApiError();

const examinationId = Number(route.query.examinationId);
const classId = Number(route.query.classId);
const studentId = route.query.studentId ? Number(route.query.studentId) : null;

const cards = ref<ReportCard[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);
const busy = ref<'print' | 'pdf' | null>(null);
const photosReady = ref(false);
const photoUrls = reactive<Record<number, string>>({});

const options = computed(() => preferences.cardOptions);

/** The photos are fetched with the session token (an <img src> cannot send it) and shown through blob URLs; print waits for them. */
async function loadPhotos(): Promise<void> {
  if (!options.value.showPhoto) {
    photosReady.value = true;
    return;
  }
  await Promise.all(cards.value.map(async (card) => {
    if (!card.photoFile) return;
    try {
      photoUrls[card.studentId] = URL.createObjectURL(await studentsApi.photoBlob(card.photoFile));
    } catch {
      // a missing photo file is reported by the deep health check; the card just shows the empty frame
    }
  }));
  photosReady.value = true;
}

onMounted(async () => {
  try {
    cards.value = sortByKhmer(await reportCardsApi.data(examinationId, classId, studentId), (c) => c.nameKm);
    await loadPhotos();
  } catch (e) {
    error.value = messageFor(e);
  } finally {
    loaded.value = true;
    photosReady.value = true;
  }
});

onBeforeUnmount(() => Object.values(photoUrls).forEach((url) => URL.revokeObjectURL(url)));

async function back(): Promise<void> {
  await navigateTo(`/report-cards?examinationId=${examinationId}`);
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
    const first = cards.value[0];
    const name = studentId !== null && first ? `report-card-${first.studentCode}.pdf` : `report-cards-${classId}.pdf`;
    const result = await savePdfOfCurrentPage(name);
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
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null || cards.length === 0 || !photosReady" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null || cards.length === 0 || !photosReady" @click="savePdf">
        {{ t('print.savePdf') }}
      </LoadingButton>
      <span v-if="cards.length > 0" class="text-muted" data-testid="card-count">{{ t('print.reportCard.count', { count: cards.length }) }}</span>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>
    <p v-else-if="loaded && cards.length === 0" class="no-print">{{ t('attendance.noStudents') }}</p>

    <ReportCardSheet v-for="card in cards" :key="card.enrollmentId" :card="card" :options="options" :photo-url="photoUrls[card.studentId] ?? null" />
  </div>
</template>
