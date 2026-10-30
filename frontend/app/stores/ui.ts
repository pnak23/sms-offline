import { defineStore } from 'pinia';
import { ref } from 'vue';

const SIDEBAR_KEY = 'sms.ui.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false; // storage can be unavailable; the UI does not depend on it
  }
}

/** Per-viewer conveniences only. Nothing sensitive is ever stored in the browser (see stores/session.ts). */
export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(readCollapsed());

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed.value ? '1' : '0');
    } catch {
      // ignore
    }
  }

  return { sidebarCollapsed, toggleSidebar };
});
