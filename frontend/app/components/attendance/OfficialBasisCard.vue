<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';
import type { AttendanceBasis } from '~/types/api';
import { ATTENDANCE_BASES } from '~/utils/attendance';

// How the school counts attendance OFFICIALLY: by days (a student present in the morning and absent in the afternoon is one partial day, never two days)
// or by sessions (every sheet counts). The dashboard and the report cards follow this choice; the history and the reports always offer both.
// Until the school chooses, it is days. The choice changes only which numbers are shown: no record is ever changed.
const { t } = useI18n();
const notify = useNotify();
const { failureText } = useApiError();
const preferences = usePreferencesStore();

const chosen = ref<AttendanceBasis>(preferences.attendanceBasis);
const saving = ref(false);
const error = ref<string | null>(null);
const dirty = computed(() => chosen.value !== preferences.attendanceBasis);

watch(() => preferences.attendanceBasis, (official) => { chosen.value = official; });

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    await preferences.save({ 'attendance.officialBasis': chosen.value });
    notify.success(t('attendance.basis.saved'));
  } catch (raised) {
    error.value = failureText(raised);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="card mt-3" data-testid="official-basis-card">
    <div class="card-body">
      <h2 class="h5">{{ t('attendance.basis.title') }}</h2>
      <DraftNotice item="attendance-counting" text-key="acceptance.draft.attendanceCounting" />
      <p class="text-muted">{{ t('attendance.basis.intro') }}</p>
      <FormAlert :message="error" />
      <form novalidate @submit.prevent="save">
        <div v-for="b in ATTENDANCE_BASES" :key="b" class="form-check mb-2">
          <input :id="`official-basis-${b}`" v-model="chosen" type="radio" class="form-check-input" name="official-basis" :value="b" />
          <label :for="`official-basis-${b}`" class="form-check-label fw-medium">{{ t(`attendance.basis.${b}`) }}</label>
          <div class="form-text">{{ t(`attendance.basis.${b}Hint`) }}</div>
        </div>
        <div class="d-flex gap-2 align-items-center mt-3">
          <LoadingButton type="submit" icon="check-lg" :loading="saving" :disabled="!dirty" data-testid="official-basis-save">{{ t('common.save') }}</LoadingButton>
          <span v-if="dirty" class="text-muted">{{ t('attendance.basis.unsaved') }}</span>
          <span v-else class="text-muted" data-testid="official-basis-current">{{ t('attendance.basis.current', { name: t(`attendance.basis.${preferences.attendanceBasis}`) }) }}</span>
        </div>
      </form>
    </div>
  </div>
</template>
