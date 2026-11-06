<script setup lang="ts" generic="K extends string">
import type { Ref } from 'vue';
import {
  HONOR_ALIGNS, HONOR_FONTS, HONOR_SIZES, HONOR_TEXT_LINES, HONOR_TEXT_MAX, honorTextProblem,
  type HonorAlign, type HonorFont, type HonorFormat, type HonorSize,
} from '~/utils/honorRoll';

// The text boxes of a printed certificate or list, one box for each place the school marked on its sample. Every word is the school's to change, and every box has
// its own font style (font, size, bold, italic, underline, alignment, and "keep each line on one line"), like a small text editor's toolbar. The words in braces
// are filled in when the page is made; clicking one puts it where the cursor is. Used by the Roll of honour page and by the Monthly ranking page: the boxes, their
// labels and the words come in as props.
const model = defineModel<Record<K, string>>({ required: true });
const formats = defineModel<Record<K, HonorFormat>>('formats', { required: true });
const props = defineProps<{
  idPrefix: string;
  /** The boxes, in the order they are shown. */
  keys: readonly K[];
  /** The i18n prefix of the box labels: "<prefix>.<key>". */
  labelPrefix: string;
  /** The words in braces that can be clicked, and the i18n prefix of what each means: "<prefix>.<word>". */
  tokens: readonly string[];
  tokenLabelPrefix: string;
  rows?: Partial<Record<K, number>>;
}>();

const { t } = useI18n();
const last = ref(props.keys[Math.min(1, props.keys.length - 1)]) as Ref<K>;   // the box the cursor was last in: the words in braces are inserted there

const problems = computed(() => Object.fromEntries(props.keys.map((key) => [key, honorTextProblem(model.value[key])])) as Record<K, 'lines' | 'length' | null>);
const problemText = (p: 'lines' | 'length' | null): string | null =>
  p === 'lines' ? t('honor.defaults.tooManyLines', { lines: HONOR_TEXT_LINES }) : p === 'length' ? t('honor.defaults.tooLong', { chars: HONOR_TEXT_MAX }) : null;

// a word in braces as it is typed in a box; written here, not in the template, because "}}" inside {{ }} ends the template's expression
const braced = (token: string): string => `{${token}}`;

function set(key: K, value: string): void {
  model.value = { ...model.value, [key]: value };
}

function setFormat<F extends keyof HonorFormat>(key: K, field: F, value: HonorFormat[F]): void {
  formats.value = { ...formats.value, [key]: { ...formats.value[key], [field]: value } };
}

async function insert(token: string): Promise<void> {
  const key = last.value;
  const el = document.getElementById(`${props.idPrefix}-${key}`) as HTMLTextAreaElement | null;
  const text = model.value[key];
  const start = el?.selectionStart ?? text.length;
  const end = el?.selectionEnd ?? text.length;
  const word = braced(token);
  set(key, text.slice(0, start) + word + text.slice(end));
  await nextTick();
  el?.focus();
  el?.setSelectionRange(start + word.length, start + word.length);
}
</script>

<template>
  <div data-testid="honor-texts">
    <p class="text-muted small mb-2">{{ t('honor.defaults.linesHint', { lines: HONOR_TEXT_LINES, chars: HONOR_TEXT_MAX }) }}</p>
    <div class="mb-3">
      <p class="text-muted small mb-1">{{ t('honor.tokens.intro') }}</p>
      <div class="d-flex flex-wrap gap-1 mb-1">
        <button v-for="token in tokens" :key="token" type="button" class="btn btn-outline-secondary btn-sm honor-token" :data-token="token" @mousedown.prevent @click="insert(token)">
          {{ braced(token) }}
        </button>
      </div>
      <p class="text-muted small mb-0">
        <span v-for="token in tokens" :key="token" class="me-3 d-inline-block">{{ braced(token) }} = {{ t(`${tokenLabelPrefix}.${token}`) }}</span>
      </p>
    </div>

    <div v-for="key in keys" :key="key" class="mb-3" :data-box="key">
      <label :for="`${idPrefix}-${key}`" class="form-label mb-1">{{ t(`${labelPrefix}.${key}`) }}</label>
      <div class="honor-format-bar" role="toolbar" :aria-label="t('honor.format.label')">
        <select class="form-select form-select-sm" :aria-label="t('honor.format.fontLabel')" :data-fmt="`${key}-font`" :value="formats[key].font" @change="setFormat(key, 'font', ($event.target as HTMLSelectElement).value as HonorFont)">
          <option v-for="font in HONOR_FONTS" :key="font" :value="font">{{ t(`honor.format.fonts.${font}`) }}</option>
        </select>
        <select class="form-select form-select-sm" :aria-label="t('honor.format.sizeLabel')" :data-fmt="`${key}-size`" :value="formats[key].size" @change="setFormat(key, 'size', ($event.target as HTMLSelectElement).value as HonorSize)">
          <option v-for="size in HONOR_SIZES" :key="size" :value="size">{{ t(`honor.format.sizes.${size}`) }}</option>
        </select>
        <div class="btn-group btn-group-sm" role="group">
          <button type="button" class="btn btn-outline-secondary fw-bold" :class="{ active: formats[key].bold }" :aria-pressed="formats[key].bold" :title="t('honor.format.bold')" :data-fmt="`${key}-bold`" @click="setFormat(key, 'bold', !formats[key].bold)">B</button>
          <button type="button" class="btn btn-outline-secondary fst-italic" :class="{ active: formats[key].italic }" :aria-pressed="formats[key].italic" :title="t('honor.format.italic')" :data-fmt="`${key}-italic`" @click="setFormat(key, 'italic', !formats[key].italic)">I</button>
          <button type="button" class="btn btn-outline-secondary text-decoration-underline" :class="{ active: formats[key].underline }" :aria-pressed="formats[key].underline" :title="t('honor.format.underline')" :data-fmt="`${key}-underline`" @click="setFormat(key, 'underline', !formats[key].underline)">U</button>
        </div>
        <div class="btn-group btn-group-sm" role="group" :aria-label="t('honor.format.alignLabel')">
          <button v-for="align in HONOR_ALIGNS" :key="align" type="button" class="btn btn-outline-secondary" :class="{ active: formats[key].align === align }" :aria-pressed="formats[key].align === align" :data-fmt="`${key}-align-${align}`" @click="setFormat(key, 'align', align as HonorAlign)">
            {{ t(`honor.format.aligns.${align}`) }}
          </button>
        </div>
        <div class="form-check form-check-inline mb-0">
          <input :id="`${idPrefix}-${key}-fit`" type="checkbox" class="form-check-input" :checked="formats[key].fit" :data-fmt="`${key}-fit`" @change="setFormat(key, 'fit', ($event.target as HTMLInputElement).checked)" />
          <label class="form-check-label small" :for="`${idPrefix}-${key}-fit`">{{ t('honor.format.fit') }}</label>
        </div>
      </div>
      <textarea
        :id="`${idPrefix}-${key}`"
        :value="model[key]"
        class="form-control"
        :class="{ 'is-invalid': problems[key] }"
        :rows="rows?.[key] ?? 2"
        autocomplete="off"
        spellcheck="false"
        @input="set(key, ($event.target as HTMLTextAreaElement).value)"
        @focus="last = key"
      />
      <div v-if="problems[key]" class="invalid-feedback d-block">{{ problemText(problems[key]) }}</div>
    </div>
  </div>
</template>
