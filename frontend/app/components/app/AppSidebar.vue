<script setup lang="ts">
import { NAV_GROUPS, type NavItem } from '~/config/nav';
import { usePreferencesStore } from '~/stores/preferences';
import { useProductStore } from '~/stores/product';
import { useUiStore } from '~/stores/ui';

const { t } = useI18n();
const ui = useUiStore();
const preferences = usePreferencesStore();
const product = useProductStore();
onMounted(() => product.load());
const visible = (item: NavItem): boolean => item.requires !== 'fees' || preferences.feesEnabled;
</script>

<template>
  <aside class="app-sidebar" :aria-label="t('nav.mainMenu')">
    <div class="sidebar-brand">
      <AppIcon name="mortarboard" class="sidebar-brand-icon" />
      <span v-if="!ui.sidebarCollapsed" class="sidebar-brand-text">{{ t('common.appShortName') }}</span>
    </div>

    <nav class="sidebar-nav">
      <div v-for="group in NAV_GROUPS" :key="group.id" class="sidebar-group">
        <div v-if="group.labelKey && !ui.sidebarCollapsed" class="sidebar-group-title">{{ t(group.labelKey) }}</div>
        <hr v-else-if="group.labelKey" class="sidebar-divider" />
        <NuxtLink
          v-for="item in group.items.filter(visible)"
          :key="item.id"
          :to="item.to"
          class="sidebar-link"
          active-class="is-active"
          :title="ui.sidebarCollapsed ? t(item.labelKey) : undefined"
          :aria-label="t(item.labelKey)"
        >
          <AppIcon :name="item.icon" />
          <span v-if="!ui.sidebarCollapsed" class="sidebar-link-text">{{ t(item.labelKey) }}</span>
        </NuxtLink>
      </div>
    </nav>

    <div v-if="product.info" class="sidebar-version" data-testid="sidebar-version" :title="`${product.info.name} v${product.info.version}`">
      {{ ui.sidebarCollapsed ? `v${product.info.version}` : product.shortLabel }}
    </div>

    <button
      type="button"
      class="sidebar-toggle"
      :title="ui.sidebarCollapsed ? t('nav.expand') : t('nav.collapse')"
      :aria-label="ui.sidebarCollapsed ? t('nav.expand') : t('nav.collapse')"
      @click="ui.toggleSidebar()"
    >
      <AppIcon :name="ui.sidebarCollapsed ? 'chevron-double-right' : 'chevron-double-left'" />
      <span v-if="!ui.sidebarCollapsed">{{ t('nav.collapse') }}</span>
    </button>
  </aside>
</template>
