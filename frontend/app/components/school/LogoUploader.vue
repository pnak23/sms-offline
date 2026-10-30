<script setup lang="ts">
import { settingsApi } from '~/services/settingsApi';
import { useSchoolStore } from '~/stores/school';
import { LOGO_ACCEPT, logoFileIssue } from '~/utils/image';

// The school logo: pick a PNG/JPG (max 5 MB), see it, remove it. The server re-encodes it; the preview is the stored copy.
const { t } = useI18n();
const { validationText } = useApiError();
const notify = useNotify();
const school = useSchoolStore();

const picker = ref<HTMLInputElement | null>(null);
const fileError = ref('');
const confirmRemove = ref(false);

const upload = useSubmit({
  fields: ['file'],
  setErrors: (errors) => {
    fileError.value = validationText(errors.file);
  },
});
const removal = useSubmit({ fields: [] });

async function onPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ''; // allows choosing the same file again
  if (!file) return;
  const issue = logoFileIssue(file);
  fileError.value = issue ? validationText(issue) : '';
  if (issue) return;
  const profile = await upload.run(() => settingsApi.uploadLogo(file));
  if (profile) {
    await school.apply(profile);
    notify.success(t('settings.school.logoSaved'));
  }
}

async function onRemove(): Promise<void> {
  const profile = await removal.run(() => settingsApi.deleteLogo());
  confirmRemove.value = false;
  if (profile) {
    await school.apply(profile);
    notify.success(t('settings.school.logoRemoved'));
  }
}
</script>

<template>
  <div class="logo-uploader">
    <div class="form-label">{{ t('settings.school.logo') }}</div>
    <div class="logo-preview" :class="{ 'is-empty': !school.logoUrl }">
      <img v-if="school.logoUrl" :src="school.logoUrl" :alt="t('settings.school.logoAlt')" />
      <AppIcon v-else name="image" />
    </div>

    <input ref="picker" type="file" class="visually-hidden" :accept="LOGO_ACCEPT" tabindex="-1" @change="onPicked" />
    <div class="d-flex flex-wrap gap-2 mt-2">
      <LoadingButton variant="outline-primary" size="sm" icon="upload" :loading="upload.submitting.value" @click="picker?.click()">
        {{ school.logoUrl ? t('settings.school.logoChange') : t('settings.school.logoChoose') }}
      </LoadingButton>
      <button v-if="school.logoUrl" type="button" class="btn btn-outline-secondary btn-sm" @click="confirmRemove = true">
        <AppIcon name="trash" />{{ t('common.remove') }}
      </button>
    </div>
    <div class="form-text">{{ t('settings.school.logoHint') }}</div>
    <div v-if="fileError || upload.formError.value" class="field-error mt-1" role="alert">{{ fileError || upload.formError.value }}</div>

    <ConfirmModal
      v-model="confirmRemove"
      :title="t('settings.school.logoRemoveTitle')"
      :message="t('settings.school.logoRemoveMessage')"
      :confirm-label="t('common.remove')"
      :loading="removal.submitting.value"
      @confirm="onRemove"
    />
  </div>
</template>
