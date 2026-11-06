<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';
import { timetableApi } from '~/services/timetableApi';
import type { ClassDto, TimetableCopyResult } from '~/types/api';

// Copy the week of another class of the same grade into this one, in two steps: a PREVIEW (changes nothing) that lists the lessons that would be copied and every lesson
// that would be skipped with the reason, then the copy, which makes exactly that. The teacher of a copied lesson is this class's own teacher for the subject, never the
// other class's (they would clash at once). Without "replace" only empty cells are filled.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{
  classId: number;
  /** The classes of the same year and grade (this one is left out here). */
  candidates: ClassDto[];
}>();
const emit = defineEmits<{ done: [] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const sourceId = ref<number | null>(null);
const replace = ref(false);
const result = ref<TimetableCopyResult | null>(null);
const busy = ref<'preview' | 'copy' | null>(null);
const error = ref<string | null>(null);

const others = computed(() => props.candidates.filter((c) => c.id !== props.classId));

watch(open, (isOpen) => {
  if (!isOpen) return;
  sourceId.value = others.value[0]?.id ?? null;
  replace.value = false;
  result.value = null;
  error.value = null;
});
// a different choice is a different copy: the old preview no longer describes it
watch([sourceId, replace], () => {
  result.value = null;
  error.value = null;
});

async function run(preview: boolean): Promise<void> {
  if (sourceId.value === null) return;
  busy.value = preview ? 'preview' : 'copy';
  error.value = null;
  try {
    const answer = await timetableApi.copyClass(props.classId, sourceId.value, replace.value, preview);
    result.value = answer;
    if (!preview) {
      notify.success(t('timetable.copy.done'));
      open.value = false;
      emit('done');
    }
  } catch (raised) {
    error.value = messageFor(raised);
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <BModal v-model="open" :title="t('timetable.copy.classTitle')" size="lg" centered lazy unmount-lazy no-close-on-backdrop :no-close-on-esc="busy !== null" data-testid="tt-copy-modal">
    <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
    <p v-if="others.length === 0" class="mb-0" data-testid="tt-copy-no-classes">{{ t('timetable.copy.noOtherClass') }}</p>
    <template v-else>
      <p class="text-muted small">{{ t('timetable.copy.classIntro') }}</p>
      <div class="mb-2">
        <label for="tt-copy-source" class="form-label">{{ t('timetable.copy.source') }}</label>
        <select id="tt-copy-source" v-model="sourceId" class="form-select" data-testid="tt-copy-source">
          <option v-for="c in others" :key="c.id" :value="c.id">{{ c.gradeName }} {{ c.nameKm }}</option>
        </select>
      </div>
      <div class="form-check mb-3">
        <input id="tt-copy-replace" v-model="replace" type="checkbox" class="form-check-input" data-testid="tt-copy-replace" />
        <label for="tt-copy-replace" class="form-check-label">{{ t('timetable.copy.replace') }}</label>
      </div>
      <TimetableCopyList v-if="result" :result="result" />
    </template>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary me-auto" :disabled="busy !== null" @click="open = false">{{ t('common.cancel') }}</button>
      <LoadingButton variant="outline-primary" icon="eye" :loading="busy === 'preview'" :disabled="sourceId === null || busy !== null" data-testid="tt-copy-preview" @click="run(true)">{{ t('timetable.copy.preview') }}</LoadingButton>
      <LoadingButton icon="files" :loading="busy === 'copy'" :disabled="!result || !result.preview || busy !== null" data-testid="tt-copy-go" @click="run(false)">{{ t('timetable.copy.go') }}</LoadingButton>
    </template>
  </BModal>
</template>
