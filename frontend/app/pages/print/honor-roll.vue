<script setup lang="ts">
import { classesApi } from '~/services/classesApi';
import { printCurrentPage, savePdfOfCurrentPage } from '~/services/desktop';
import { examsApi } from '~/services/examsApi';
import type { ClassDto } from '~/types/api';
import { todayIso } from '~/utils/date';
import { parseHonorQuery, selectHonorRoll, type HonorRoll } from '~/utils/honorRoll';
import { compareKhmer } from '~/utils/sort';

// The printable roll of honour (តារាងកិត្តិយស), A4: one sheet per class, with the first 5 or 10 students of the examination (see utils/honorRoll.ts).
// What to print comes from the address (the options window of the Report cards page); nothing is stored. The sheet itself is components/print/HonorRollSheet.vue.
definePageMeta({ layout: 'print' });

const { t } = useI18n();
const route = useRoute();
const notify = useNotify();
const { messageFor } = useApiError();

const query = parseHonorQuery(route.query);
const options = { ...query.options, date: query.options.date || todayIso() };
const examName = ref('');

interface Sheet {
  cls: ClassDto;
  roll: HonorRoll;
}
const sheets = ref<Sheet[]>([]);
/** Classes of the examination's year that have no student with a complete result yet: no sheet is made for them. */
const skipped = ref<string[]>([]);
const loaded = ref(false);
const error = ref<string | null>(null);
const busy = ref<'print' | 'pdf' | null>(null);

const labelOf = (cls: ClassDto): string => `${cls.gradeName} ${cls.nameKm}`;

onMounted(async () => {
  try {
    const exam = await examsApi.get(query.examinationId);
    examName.value = exam.nameKm;
    const classes = query.classId !== null
      ? [(await classesApi.get(query.classId)).schoolClass]
      : (await classesApi.list({ yearId: exam.academicYearId })).sort((a, b) => a.gradeLevel - b.gradeLevel || compareKhmer(a.nameKm, b.nameKm));
    // one class at a time: the results are worked out for each request, and a request at a time is gentler on the single database connection
    for (const cls of classes) {
      const results = await examsApi.results(exam.id, cls.id);
      const roll = selectHonorRoll(results.students, options.count);
      if (roll.entries.length > 0) sheets.value.push({ cls, roll });
      else skipped.value.push(labelOf(cls));
    }
  } catch (e) {
    error.value = messageFor(e);
  } finally {
    loaded.value = true;
  }
});

async function back(): Promise<void> {
  await navigateTo({ path: '/honor-roll', query: route.query });   // back to the roll of honour page, with everything that was chosen
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
    const result = await savePdfOfCurrentPage(`honor-roll-${query.classId ?? 'all'}-top${options.count}.pdf`);
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
      <LoadingButton icon="printer" :loading="busy === 'print'" :disabled="busy !== null || sheets.length === 0" @click="print">{{ t('print.print') }}</LoadingButton>
      <LoadingButton variant="outline-primary" icon="file-earmark-pdf" :loading="busy === 'pdf'" :disabled="busy !== null || sheets.length === 0" @click="savePdf">
        {{ t('print.savePdf') }}
      </LoadingButton>
      <span v-if="sheets.length > 0" class="text-muted" data-testid="honor-count">{{ t('honor.sheetCount', { count: sheets.length }) }}</span>
    </div>

    <div v-if="error" class="alert alert-danger no-print" role="alert">{{ error }}</div>
    <p v-else-if="loaded && sheets.length === 0" class="no-print" data-testid="honor-none">{{ t('honor.none') }}</p>
    <p v-if="skipped.length > 0" class="text-muted no-print" data-testid="honor-skipped">{{ t('honor.skipped', { names: skipped.join('، ') }) }}</p>

    <HonorRollSheet
      v-for="sheet in sheets"
      :key="sheet.cls.id"
      :roll="sheet.roll"
      :art-style="options.style"
      :options="options"
      :class-label="labelOf(sheet.cls)"
      :teacher-name="sheet.cls.homeroomTeacherName"
      :class-id="sheet.cls.id"
      :exam-name="examName"
    />
  </div>
</template>
