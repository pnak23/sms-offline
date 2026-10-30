<script setup lang="ts">
import { BModal } from 'bootstrap-vue-next/components/BModal';

// Every destructive action goes through this confirmation (brief: "Destructive actions use a confirm modal").
const open = defineModel<boolean>({ required: true });

withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmLabel: string;
    variant?: 'danger' | 'primary';
    loading?: boolean;
  }>(),
  { variant: 'danger' },
);

const emit = defineEmits<{ confirm: [] }>();

const { t } = useI18n();
</script>

<template>
  <BModal v-model="open" :title="title" centered no-close-on-backdrop :no-close-on-esc="loading">
    <p class="mb-0">{{ message }}</p>
    <template #footer>
      <button type="button" class="btn btn-outline-secondary" :disabled="loading" @click="open = false">
        {{ t('common.cancel') }}
      </button>
      <LoadingButton :variant="variant" :loading="loading" @click="emit('confirm')">{{ confirmLabel }}</LoadingButton>
    </template>
  </BModal>
</template>
