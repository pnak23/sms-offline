<script setup lang="ts">
import { useSchoolStore } from '~/stores/school';
import { useUiStore } from '~/stores/ui';

const { t } = useI18n();
const school = useSchoolStore();
const ui = useUiStore();
</script>

<template>
  <header class="app-header">
    <button
      type="button"
      class="btn btn-outline-secondary btn-sm header-toggle"
      :title="ui.sidebarCollapsed ? t('nav.expand') : t('nav.collapse')"
      :aria-label="ui.sidebarCollapsed ? t('nav.expand') : t('nav.collapse')"
      @click="ui.toggleSidebar()"
    >
      <AppIcon name="list" />
    </button>

    <div class="header-school" :title="school.name || undefined">
      <img v-if="school.logoUrl" :src="school.logoUrl" alt="" class="header-logo" />
      <span v-if="school.hasName" class="header-school-name">{{ school.name }}</span>
      <NuxtLink v-else to="/settings/school" class="header-school-name text-muted">{{ t('nav.schoolNameMissing') }}</NuxtLink>
    </div>

    <UserMenu class="ms-auto" />
  </header>
</template>
