<script setup lang="ts">
import { useAcceptanceStore } from '~/stores/acceptance';
import { useSchoolStore } from '~/stores/school';
import type { ReportCard } from '~/types/api';
import { columnLabels, countsOf } from '~/utils/attendance';
import { formatDateKm, formatLongDateKm } from '~/utils/date';
import { orderSubjects, type ReportCardOptions } from '~/utils/reportCardOptions';
import { formatNumber } from '~/utils/score';

// One report card (A4). The printed pages and the preview in Settings → Report card are this same component, so what the settings page shows is
// what comes out of the printer. Which blocks it has is the school's choice (`options`); the content is the student's.
// It is spaced tightly on purpose: twelve subjects must still fit one A4 page (desktop/test/e2e-app.mjs, P3-36b; e2e-changes.mjs with every block on).
const props = defineProps<{ card: ReportCard; options: ReportCardOptions; photoUrl?: string | null }>();
/** Whether the card had to switch to the tighter type to fit one page (the settings page tells the school). */
const emit = defineEmits<{ compact: [value: boolean] }>();

const { t } = useI18n();
const school = useSchoolStore();
const acceptance = useAcceptanceStore();
const { genderLabel, examKindLabel } = useLabels();

const issued = computed(() => formatLongDateKm(new Date()));
const subjects = computed(() => orderSubjects(props.card.subjects, props.options.subjectOrder));

// A card that does not fit one A4 page as it is (many subjects together with the optional blocks, a long comment) sets itself in a tighter type
// instead of spilling onto a second page. It is measured with the page's own minimum height lifted (the same way as the A4 checks in the tests);
// a card that fits is never touched, so the default card looks exactly as it always did.
const A4_HEIGHT_PX = 1122;   // 297 mm at 96 dpi
const sheet = ref<HTMLElement | null>(null);
const compact = ref(false);

async function fit(): Promise<void> {
  compact.value = false;
  await nextTick();
  const el = sheet.value;
  if (!el) return;
  const minHeight = el.style.minHeight;
  el.style.minHeight = '0';
  compact.value = el.offsetHeight > A4_HEIGHT_PX;
  el.style.minHeight = minHeight;
}

watch(compact, (value) => emit('compact', value));
watch(() => [props.card, props.options, props.photoUrl, school.profile, school.logoUrl], () => void fit(), { deep: true, flush: 'post' });
onMounted(async () => {
  await fit();
  // fonts and the logo change line heights once they arrive
  await document.fonts?.ready;
  await fit();
});
/** The attendance block, counted the school's official way: the card itself says whether its numbers are days or sessions. */
const attendanceLabels = computed(() => columnLabels(t, props.card.attendance.basis));
const attendanceCounts = computed(() => {
  const a = props.card.attendance;
  const as = { present: a.present, absent: a.absent, late: a.late, leave: a.leave, total: a.total, days: { present: a.present, late: a.late, partial: a.partial, absent: a.absent, leave: a.leave, total: a.total } };
  return countsOf(as, a.basis);
});
const scoreText = (score: number | null, absent: boolean): string => (absent ? t('exams.absentShort') : score === null ? '—' : formatNumber(score));

/** The caption under a signature box: the one the school typed, or that box's default (the director with their name, the class teacher, the guardian). */
function caption(index: number): string {
  const typed = props.options.signatures[index];
  if (typed) return typed;
  if (index === 0) return `${t('print.student.director')}${school.profile?.directorName ? `: ${school.profile.directorName}` : ''}`;
  return t(index === 1 ? 'print.attendance.teacher' : 'print.reportCard.guardian');
}
</script>

<template>
  <article ref="sheet" class="print-sheet student-sheet report-card" :class="{ 'report-card-compact': compact }" lang="km" :data-student="card.studentCode">
    <PrintHeader :show-logo="options.showLogo" :show-national="options.showNationalHeader" />

    <h1 class="student-sheet-title">{{ t('print.reportCard.title') }}</h1>
    <p class="report-card-sub">
      {{ card.examinationName }} · {{ examKindLabel(card.kind) }}{{ card.termNo !== null ? ` · ${t('exams.termShort', { term: card.termNo })}` : '' }} · {{ card.yearName }}
    </p>

    <div class="report-card-who" :class="{ 'has-photo': options.showPhoto }">
      <table class="student-sheet-table report-card-student">
        <tbody>
          <tr><th>{{ t('students.code') }}</th><td>{{ card.studentCode }}</td><th>{{ t('classes.title') }}</th><td>{{ card.gradeName }} {{ card.className }}</td></tr>
          <tr><th>{{ t('students.nameKm') }}</th><td class="fw-semibold">{{ card.nameKm }}</td><th>{{ t('common.gender') }}</th><td>{{ genderLabel(card.gender) }}</td></tr>
          <tr><th>{{ t('students.nameEn') }}</th><td>{{ card.nameEn ?? '—' }}</td><th>{{ t('students.dateOfBirth') }}</th><td>{{ formatDateKm(card.dateOfBirth) }}</td></tr>
        </tbody>
      </table>
      <div v-if="options.showPhoto" class="report-card-photo" data-testid="card-photo">
        <img v-if="photoUrl" :src="photoUrl" alt="" />
        <AppIcon v-else name="person-circle" class="report-card-photo-empty" />
      </div>
    </div>

    <h2 class="student-sheet-heading">{{ t('print.reportCard.scores') }}</h2>
    <p v-if="subjects.length === 0" class="student-sheet-none">{{ t('exams.noSubjectsForGrade') }}</p>
    <table v-else class="student-sheet-grid report-card-scores">
      <thead>
        <tr>
          <th class="report-card-no">{{ t('print.attendance.number') }}</th>
          <th>{{ t('exams.subject') }}</th>
          <th class="report-card-num">{{ t('exams.maxScore') }}</th>
          <th class="report-card-num">{{ t('exams.weight') }}</th>
          <th class="report-card-num">{{ t('exams.score') }}</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(s, index) in subjects" :key="s.examSubjectId">
          <tr>
            <td class="report-card-no">{{ index + 1 }}</td>
            <td>{{ s.subjectName }}</td>
            <td class="report-card-num">{{ formatNumber(s.maxScore) }}</td>
            <td class="report-card-num">{{ formatNumber(s.weight) }}</td>
            <td class="report-card-num fw-semibold">{{ scoreText(s.score, s.absent) }}</td>
          </tr>
          <!-- the detail under a main subject made of sub-subjects, only when the school switched it on -->
          <template v-if="options.showSubSubjects">
            <tr v-for="(sub, subIndex) in s.subSubjects" :key="`${s.examSubjectId}-${subIndex}`" class="report-card-sub" data-testid="report-card-sub">
              <td class="report-card-no" />
              <td>↳ {{ sub.subjectName }}</td>
              <td class="report-card-num">{{ formatNumber(sub.maxScore) }}</td>
              <td class="report-card-num" />
              <td class="report-card-num">{{ scoreText(sub.score, sub.absent) }}</td>
            </tr>
          </template>
        </template>
      </tbody>
    </table>

    <table class="student-sheet-grid report-card-summary">
      <tbody>
        <tr>
          <th>{{ t('exams.total') }}</th>
          <td>{{ formatNumber(card.total) }} / {{ formatNumber(card.totalMax) }}</td>
          <th>{{ t('exams.percent') }}</th>
          <td>{{ card.percent === null ? '—' : `${formatNumber(card.percent)} %` }}</td>
        </tr>
        <tr>
          <th>{{ t('exams.band') }}</th>
          <td :colspan="options.showRank ? 1 : 3">{{ card.bandLetter ? `${card.bandLetter} · ${card.bandLabel}` : '—' }}</td>
          <template v-if="options.showRank">
            <th>{{ t('exams.rank') }}</th>
            <td data-testid="card-rank">{{ card.rank === null ? '—' : t('print.reportCard.rankOf', { rank: card.rank, count: card.rankedCount }) }}</td>
          </template>
        </tr>
        <tr>
          <th>{{ t('exams.outcome') }}</th>
          <td colspan="3" class="fw-semibold">
            {{ !card.complete ? t('print.reportCard.incomplete') : card.passed ? t('exams.passed') : t('exams.failed') }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="subjects.some((s) => s.absent)" class="report-card-note">{{ t('exams.absentAsZero') }}</p>

    <template v-if="options.showAttendance">
      <h2 class="student-sheet-heading" data-testid="card-attendance-title">{{ t('print.reportCard.attendance') }} · {{ t(`attendance.basis.${card.attendance.basis}`) }}</h2>
      <table class="student-sheet-grid report-card-attendance" data-testid="card-attendance" :data-basis="card.attendance.basis">
        <thead>
          <tr>
            <th v-for="(label, i) in attendanceLabels" :key="i">{{ label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td v-for="(n, i) in attendanceCounts" :key="i">{{ n }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-if="options.showComment">
      <h2 class="student-sheet-heading">{{ t('print.reportCard.comment') }}</h2>
      <div class="report-card-comment" data-testid="card-comment">{{ card.comment ?? '' }}</div>
    </template>

    <p v-if="!acceptance.signed('grading-rules')" class="report-card-draft" data-testid="card-draft-note">{{ t('acceptance.draft.cardLine') }}</p>
    <p v-if="options.footerNote" class="report-card-footnote" data-testid="card-footnote">{{ options.footerNote }}</p>

    <footer class="student-sheet-footer report-card-footer" :data-signatures="options.signatures.length">
      <div>{{ t('print.student.date', { date: issued }) }}</div>
      <div v-if="options.signatures.length > 0" class="report-card-signatures">
        <div v-for="(_, index) in options.signatures" :key="index" class="student-sheet-signature" data-testid="card-signature">
          <span class="signature-line" />
          <span>{{ caption(index) }}</span>
        </div>
      </div>
    </footer>
  </article>
</template>
