<script setup lang="ts">
import { studentsApi } from '~/services/studentsApi';
import type { Student, StudentDetail } from '~/types/api';
import { logoFileIssue } from '~/utils/image';

// The student's photo: fetched with the session token and shown through a blob URL (an <img src> cannot send the token).
// The server decodes the upload, shrinks it to 512 px and stores a JPEG under a generated name.
const props = defineProps<{ student: Student; readonly?: boolean }>();
const emit = defineEmits<{ updated: [detail: StudentDetail] }>();

const { t } = useI18n();
const { messageFor, validationText } = useApiError();
const notify = useNotify();

const url = ref<string | null>(null);
const busy = ref(false);
const input = ref<HTMLInputElement | null>(null);
let shown: string | null = null;

function release(): void {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = null;
  shown = null;
}

async function refresh(): Promise<void> {
  const file = props.student.photoFile;
  if (file === shown) return;
  release();
  if (!file) return;
  try {
    url.value = URL.createObjectURL(await studentsApi.photoBlob(file));
    shown = file;
  } catch {
    // a missing photo file is reported by the deep health check; the page just shows the placeholder
  }
}

async function pick(event: Event): Promise<void> {
  const el = event.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  const issue = logoFileIssue(file);
  if (issue) {
    notify.error(validationText(issue));
    return;
  }
  busy.value = true;
  try {
    emit('updated', await studentsApi.uploadPhoto(props.student.id, file));
    notify.success(t('students.photoSaved'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busy.value = false;
  }
}

async function remove(): Promise<void> {
  busy.value = true;
  try {
    emit('updated', await studentsApi.removePhoto(props.student.id));
    notify.success(t('students.photoRemoved'));
  } catch (error) {
    notify.error(messageFor(error));
  } finally {
    busy.value = false;
  }
}

watch(() => props.student.photoFile, refresh, { immediate: true });
onBeforeUnmount(release);
</script>

<template>
  <div class="student-photo">
    <div class="student-photo-frame">
      <img v-if="url" :src="url" :alt="t('students.photoAlt', { name: student.nameKm })" />
      <AppIcon v-else name="person-circle" class="student-photo-placeholder" />
    </div>
    <div v-if="!readonly" class="d-grid gap-2 mt-2">
      <input ref="input" type="file" class="visually-hidden" accept="image/png,image/jpeg" tabindex="-1" @change="pick" />
      <LoadingButton size="sm" variant="outline-primary" icon="upload" :loading="busy" @click="input?.click()">{{ t(url ? 'students.photoChange' : 'students.photoChoose') }}</LoadingButton>
      <button v-if="url" type="button" class="btn btn-outline-secondary btn-sm" :disabled="busy" @click="remove"><AppIcon name="trash" />{{ t('common.remove') }}</button>
    </div>
  </div>
</template>
