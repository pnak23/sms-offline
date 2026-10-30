<script setup lang="ts">
import { BDropdown, BDropdownDivider, BDropdownHeader, BDropdownItem } from 'bootstrap-vue-next/components/BDropdown';
import { useSessionStore } from '~/stores/session';

const { t } = useI18n();
const session = useSessionStore();
const signOut = useSignOut();
</script>

<template>
  <BDropdown variant="outline-secondary" placement="bottom-end" :aria-label="t('nav.userMenu')" toggle-class="user-menu-toggle">
    <template #button-content>
      <AppIcon name="person-circle" />
      <span class="user-menu-name">{{ session.user?.displayName }}</span>
    </template>
    <BDropdownHeader class="user-menu-header">
      <div class="fw-semibold">{{ session.user?.displayName }}</div>
      <div class="text-muted small">{{ session.user?.username }}</div>
    </BDropdownHeader>
    <BDropdownDivider />
    <BDropdownItem @click="session.lock()"><AppIcon name="lock" class="me-2" />{{ t('nav.lock') }}</BDropdownItem>
    <BDropdownItem to="/settings/security"><AppIcon name="key" class="me-2" />{{ t('nav.changePassword') }}</BDropdownItem>
    <BDropdownDivider />
    <BDropdownItem @click="signOut"><AppIcon name="box-arrow-right" class="me-2" />{{ t('nav.signOut') }}</BDropdownItem>
  </BDropdown>
</template>
