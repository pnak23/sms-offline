<script setup lang="ts">
import { useProductStore } from '~/stores/product';

const { t } = useI18n();
const product = useProductStore();
onMounted(() => product.load());
</script>

<template>
  <div class="auth-shell">
    <header class="auth-brand">
      <h1 class="auth-brand-title">{{ t('common.appName') }}</h1>
      <p v-if="product.info" class="auth-brand-product" data-testid="auth-product">
        {{ product.info.name }}<br />{{ product.info.shortName }} · {{ t('about.version') }} {{ product.info.version }}
      </p>
      <p class="auth-brand-sub">{{ t('common.appTagline') }}</p>
    </header>
    <main class="auth-card-area">
      <slot />
    </main>
  </div>
</template>
