<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <div class="auth-shell">
    <header class="auth-brand">
      <h1 class="auth-brand-title">{{ t('common.appName') }}</h1>
      <p class="auth-brand-sub">{{ t('common.appTagline') }}</p>
    </header>
    <main class="auth-card-area">
      <slot />
    </main>
  </div>
</template>
