<script setup lang="ts">
import { HONOR_STYLE_IDS, plateSvg, type HonorStyleId } from '~/utils/honorArt';

// The ten artwork choices of the roll of honour, shown as small pictures (a frame each). Used by the options window and by Settings → Roll of honour.
// The pictures are built from constants in utils/honorArt.ts only, never from anything typed, so v-html is safe here.
const model = defineModel<HonorStyleId>({ required: true });
withDefaults(defineProps<{ idPrefix?: string }>(), { idPrefix: 'honor-style' });

const { t } = useI18n();
const previews = Object.fromEntries(HONOR_STYLE_IDS.map((id) => [id, plateSvg(id)])) as Record<HonorStyleId, string>;
</script>

<template>
  <div class="honor-style-grid" role="radiogroup" :aria-label="t('honor.style.label')">
    <div v-for="id in HONOR_STYLE_IDS" :key="id" class="honor-style-choice">
      <input :id="`${idPrefix}-${id}`" v-model="model" class="visually-hidden" type="radio" :name="idPrefix" :value="id" />
      <label class="honor-style-card" :class="{ active: model === id }" :for="`${idPrefix}-${id}`" :data-style="id">
        <span class="honor-style-preview" aria-hidden="true" v-html="previews[id]" />
        <span class="honor-style-name">{{ t(`honor.style.${id}`) }}</span>
      </label>
    </div>
  </div>
</template>
