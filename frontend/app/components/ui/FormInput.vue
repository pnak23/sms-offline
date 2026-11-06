<script setup lang="ts">
import { useField, useSubmitCount } from 'vee-validate';

const props = withDefaults(
  defineProps<{
    name: string;
    label: string;
    type?: 'text' | 'password' | 'date' | 'textarea';
    placeholder?: string;
    autocomplete?: string;
    autofocus?: boolean;
    hint?: string;
    rows?: number;
    inputmode?: 'text' | 'numeric' | 'tel' | 'decimal';
    maxlength?: number;
    disabled?: boolean;
    required?: boolean;
    monospace?: boolean;
    /** Re-formats the text while typing/pasting and says where the caret goes (e.g. recovery-key dashes). */
    formatter?: (text: string, caret: number) => { value: string; caret: number };
  }>(),
  { type: 'text', rows: 3 },
);

const emit = defineEmits<{ blur: [] }>();

const { t } = useI18n();
const { validationText } = useApiError();
const { value, errorMessage, meta, handleBlur } = useField<string>(() => props.name);
const submitCount = useSubmitCount();

const input = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const revealed = ref(false);
const inputId = `field-${props.name}-${useId()}`;

const isPassword = computed(() => props.type === 'password');
const inputType = computed(() => (isPassword.value && revealed.value ? 'text' : props.type));
const shownError = computed(() => (errorMessage.value && (meta.touched || submitCount.value > 0) ? validationText(errorMessage.value) : ''));
const describedBy = computed(() => [shownError.value ? `${inputId}-error` : '', props.hint ? `${inputId}-hint` : ''].filter(Boolean).join(' ') || undefined);

function onInput(event: Event): void {
  if (!props.formatter) return;
  const el = event.target as HTMLInputElement;
  const next = props.formatter(el.value, el.selectionStart ?? el.value.length);
  value.value = next.value;
  el.value = next.value;
  el.setSelectionRange(next.caret, next.caret);
}

function onBlur(): void {
  handleBlur();
  emit('blur');
}

function focus(): void {
  input.value?.focus();
}

onMounted(() => {
  if (props.autofocus) void nextTick(focus);
});

defineExpose({ focus });
</script>

<template>
  <div class="mb-3">
    <label :for="inputId" class="form-label">
      {{ label }}<span v-if="required" class="text-danger" aria-hidden="true"> *</span>
    </label>

    <textarea
      v-if="type === 'textarea'"
      :id="inputId"
      ref="input"
      v-model="value"
      class="form-control"
      :class="{ 'is-invalid': shownError }"
      :rows="rows"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :disabled="disabled"
      :aria-invalid="shownError ? 'true' : undefined"
      :aria-describedby="describedBy"
      spellcheck="false"
      @blur="onBlur"
    />

    <div v-else class="input-group has-validation">
      <input
        :id="inputId"
        ref="input"
        v-model="value"
        class="form-control"
        :class="{ 'is-invalid': shownError, 'font-monospace': monospace }"
        :type="inputType"
        :placeholder="placeholder"
        :autocomplete="autocomplete ?? 'off'"
        :inputmode="inputmode"
        :maxlength="maxlength"
        :disabled="disabled"
        :aria-invalid="shownError ? 'true' : undefined"
        :aria-describedby="describedBy"
        spellcheck="false"
        @input="onInput"
        @blur="onBlur"
      />
      <button
        v-if="isPassword"
        type="button"
        class="btn btn-outline-secondary"
        :title="revealed ? t('common.hidePassword') : t('common.showPassword')"
        :aria-label="revealed ? t('common.hidePassword') : t('common.showPassword')"
        :aria-pressed="revealed"
        :disabled="disabled"
        @click="revealed = !revealed"
      >
        <AppIcon :name="revealed ? 'eye-slash' : 'eye'" />
      </button>
    </div>

    <div v-if="shownError" :id="`${inputId}-error`" class="field-error mt-1" role="alert">{{ shownError }}</div>
    <div v-if="hint" :id="`${inputId}-hint`" class="form-text">{{ hint }}</div>
    <slot />
  </div>
</template>
