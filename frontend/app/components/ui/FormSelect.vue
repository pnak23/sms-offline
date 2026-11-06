<script setup lang="ts">
import { useField, useSubmitCount } from 'vee-validate';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

// A <select> wired to vee-validate like FormInput. Values are strings in the form (the page converts ids to numbers on submit).
// `placeholder` adds an empty first choice with that text; leave it out when something is always chosen.
const props = defineProps<{
  name: string;
  label: string;
  options: readonly SelectOption[];
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
}>();

const { validationText } = useApiError();
const { value, errorMessage, meta, handleBlur } = useField<string>(() => props.name);
const submitCount = useSubmitCount();
const inputId = `field-${props.name}-${useId()}`;

const shownError = computed(() => (errorMessage.value && (meta.touched || submitCount.value > 0) ? validationText(errorMessage.value) : ''));
const describedBy = computed(() => [shownError.value ? `${inputId}-error` : '', props.hint ? `${inputId}-hint` : ''].filter(Boolean).join(' ') || undefined);
</script>

<template>
  <div class="mb-3">
    <label :for="inputId" class="form-label">
      {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </label>
    <select
      :id="inputId"
      v-model="value"
      class="form-select"
      :class="{ 'is-invalid': shownError }"
      :disabled="disabled"
      :aria-invalid="shownError ? 'true' : undefined"
      :aria-describedby="describedBy"
      @blur="handleBlur"
    >
      <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
      <option v-for="option in options" :key="option.value" :value="String(option.value)" :disabled="option.disabled">{{ option.label }}</option>
    </select>
    <div v-if="shownError" :id="`${inputId}-error`" class="field-error mt-1" role="alert">{{ shownError }}</div>
    <div v-if="hint" :id="`${inputId}-hint`" class="form-text">{{ hint }}</div>
  </div>
</template>
