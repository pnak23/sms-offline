<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';
import { useSchoolStore } from '~/stores/school';
import { CAPTION_MAX, DEFAULT_CARD_OPTIONS, FOOTER_NOTE_MAX, MAX_SIGNATURES, cardSettingsOf, type ReportCardOptions } from '~/utils/reportCardOptions';
import { sampleReportCard } from '~/utils/sampleReportCard';

// What the printed report card has: its blocks, how many signature boxes with which captions, a closing note and the order of the subjects.
// The school has not yet given its real report card, so none of this is fixed: the preview on the right is the real card component with made-up data,
// and it changes as you choose. Nothing is saved until "Save"; "Back to the defaults" only fills the form (it saves nothing either).
const { t } = useI18n();
const notify = useNotify();
const { failureText } = useApiError();
const preferences = usePreferencesStore();
const school = useSchoolStore();

const draft = reactive({
  showLogo: true, showNationalHeader: true, showPhoto: false, showAttendance: true, showRank: true, showComment: true,
  signatureCount: 1, captions: ['', '', ''], footerNote: '', subjectOrder: 'default' as ReportCardOptions['subjectOrder'], showSubSubjects: false,
});
const saving = ref(false);
const error = ref<string | null>(null);
const twelve = ref(false);          // preview with twelve subjects: the fullest card a page has to hold
const previewCompact = ref(false);  // the preview had to switch to the tighter type to fit one page

function fill(o: ReportCardOptions): void {
  Object.assign(draft, {
    showLogo: o.showLogo, showNationalHeader: o.showNationalHeader, showPhoto: o.showPhoto, showAttendance: o.showAttendance, showRank: o.showRank, showComment: o.showComment,
    signatureCount: o.signatures.length, footerNote: o.footerNote, subjectOrder: o.subjectOrder, showSubSubjects: o.showSubSubjects,
  });
  draft.captions = [0, 1, 2].map((i) => o.signatures[i] ?? '');
}

const options = computed<ReportCardOptions>(() => ({
  showLogo: draft.showLogo,
  showNationalHeader: draft.showNationalHeader,
  showPhoto: draft.showPhoto,
  showAttendance: draft.showAttendance,
  showRank: draft.showRank,
  showComment: draft.showComment,
  signatures: draft.captions.slice(0, draft.signatureCount).map((c) => c.trim()),
  footerNote: draft.footerNote.trim(),
  subjectOrder: draft.subjectOrder,
  showSubSubjects: draft.showSubSubjects,
}));
const dirty = computed(() => JSON.stringify(cardSettingsOf(options.value)) !== JSON.stringify(cardSettingsOf(preferences.cardOptions)));
const sample = computed(() => sampleReportCard(t, twelve.value ? 12 : 5));
const defaultCaption = (i: number): string =>
  i === 0 ? `${t('print.student.director')}${school.profile?.directorName ? `: ${school.profile.directorName}` : ''}` : t(i === 1 ? 'print.attendance.teacher' : 'print.reportCard.guardian');

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    await preferences.save(cardSettingsOf(options.value));
    notify.success(t('reportCardTemplate.saved'));
  } catch (raised) {
    error.value = failureText(raised);
  } finally {
    saving.value = false;
  }
}

watch(() => preferences.loaded, () => fill(preferences.cardOptions), { immediate: true });
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('reportCardTemplate.title')" :subtitle="t('reportCardTemplate.subtitle')" />
    <DraftNotice item="report-card-template" text-key="acceptance.draft.reportCardTemplate" />
    <div class="row g-3">
      <div class="col-xl-5">
        <div class="card">
          <div class="card-body">
            <FormAlert :message="error" />
            <form novalidate data-testid="card-template-form" @submit.prevent="save">
              <h2 class="h5">{{ t('reportCardTemplate.blocksTitle') }}</h2>
              <div class="form-check form-switch mb-2">
                <input id="card-opt-logo" v-model="draft.showLogo" type="checkbox" class="form-check-input" role="switch" />
                <label for="card-opt-logo" class="form-check-label">{{ t('reportCardTemplate.logo') }}</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input id="card-opt-national" v-model="draft.showNationalHeader" type="checkbox" class="form-check-input" role="switch" />
                <label for="card-opt-national" class="form-check-label">{{ t('reportCardTemplate.nationalHeader') }}</label>
                <div class="form-text">{{ t('reportCardTemplate.nationalHeaderHint') }}</div>
              </div>
              <div class="form-check form-switch mb-2">
                <input id="card-opt-photo" v-model="draft.showPhoto" type="checkbox" class="form-check-input" role="switch" />
                <label for="card-opt-photo" class="form-check-label">{{ t('reportCardTemplate.photo') }}</label>
                <div class="form-text">{{ t('reportCardTemplate.photoHint') }}</div>
              </div>
              <div class="form-check form-switch mb-2">
                <input id="card-opt-attendance" v-model="draft.showAttendance" type="checkbox" class="form-check-input" role="switch" />
                <label for="card-opt-attendance" class="form-check-label">{{ t('reportCardTemplate.attendance') }}</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input id="card-opt-rank" v-model="draft.showRank" type="checkbox" class="form-check-input" role="switch" />
                <label for="card-opt-rank" class="form-check-label">{{ t('reportCardTemplate.rank') }}</label>
              </div>
              <div class="form-check form-switch mb-2">
                <input id="card-opt-comment" v-model="draft.showComment" type="checkbox" class="form-check-input" role="switch" />
                <label for="card-opt-comment" class="form-check-label">{{ t('reportCardTemplate.comment') }}</label>
              </div>
              <div class="form-check form-switch mb-3">
                <input id="card-opt-subs" v-model="draft.showSubSubjects" type="checkbox" class="form-check-input" role="switch" />
                <label for="card-opt-subs" class="form-check-label">{{ t('reportCardTemplate.subSubjects') }}</label>
                <div class="form-text">{{ t('reportCardTemplate.subSubjectsHint') }}</div>
              </div>

              <h2 class="h5 mt-4">{{ t('reportCardTemplate.signaturesTitle') }}</h2>
              <div class="mb-3">
                <label for="card-opt-signatures" class="form-label">{{ t('reportCardTemplate.signatureCount') }}</label>
                <select id="card-opt-signatures" v-model.number="draft.signatureCount" class="form-select w-auto">
                  <option v-for="n in MAX_SIGNATURES + 1" :key="n" :value="n - 1">{{ n - 1 }}</option>
                </select>
              </div>
              <div v-for="i in draft.signatureCount" :key="i" class="mb-3">
                <label :for="`card-opt-caption-${i}`" class="form-label">{{ t('reportCardTemplate.signatureCaption', { n: i }) }}</label>
                <input :id="`card-opt-caption-${i}`" v-model="draft.captions[i - 1]" class="form-control" :maxlength="CAPTION_MAX" :placeholder="defaultCaption(i - 1)" autocomplete="off" />
              </div>
              <p v-if="draft.signatureCount > 0" class="form-text">{{ t('reportCardTemplate.signatureHint') }}</p>

              <h2 class="h5 mt-4">{{ t('reportCardTemplate.moreTitle') }}</h2>
              <div class="mb-3">
                <label for="card-opt-footnote" class="form-label">{{ t('reportCardTemplate.footerNote') }}</label>
                <input id="card-opt-footnote" v-model="draft.footerNote" class="form-control" :maxlength="FOOTER_NOTE_MAX" autocomplete="off" />
                <div class="form-text">{{ t('reportCardTemplate.footerNoteHint') }}</div>
              </div>
              <div class="mb-4">
                <label for="card-opt-order" class="form-label">{{ t('reportCardTemplate.order') }}</label>
                <select id="card-opt-order" v-model="draft.subjectOrder" class="form-select w-auto">
                  <option value="default">{{ t('reportCardTemplate.orderDefault') }}</option>
                  <option value="name">{{ t('reportCardTemplate.orderName') }}</option>
                </select>
              </div>

              <div class="d-flex gap-2 flex-wrap align-items-center">
                <LoadingButton type="submit" icon="check-lg" :loading="saving" :disabled="!dirty" data-testid="card-template-save">{{ t('common.save') }}</LoadingButton>
                <button type="button" class="btn btn-outline-secondary" data-testid="card-template-reset" @click="fill(DEFAULT_CARD_OPTIONS)">{{ t('reportCardTemplate.reset') }}</button>
                <span v-if="dirty" class="text-muted">{{ t('reportCardTemplate.unsaved') }}</span>
              </div>
            </form>
          </div>
        </div>
      </div>
      <div class="col-xl-7">
        <div class="card">
          <div class="card-body">
            <h2 class="h5">{{ t('reportCardTemplate.previewTitle') }}</h2>
            <p class="text-muted small">{{ t('reportCardTemplate.previewHint') }}</p>
            <div class="form-check mb-2">
              <input id="card-opt-twelve" v-model="twelve" type="checkbox" class="form-check-input" />
              <label for="card-opt-twelve" class="form-check-label">{{ t('reportCardTemplate.twelve') }}</label>
            </div>
            <p v-if="previewCompact" class="small text-warning-emphasis" data-testid="card-template-compact">{{ t('reportCardTemplate.compactNote') }}</p>
            <div class="report-card-preview" data-testid="card-template-preview" aria-hidden="true">
              <ReportCardSheet :card="sample" :options="options" @compact="previewCompact = $event" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
