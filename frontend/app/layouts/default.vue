<script setup lang="ts">
import { useUiStore } from '~/stores/ui';

const ui = useUiStore();

// A narrow window (a laptop at 125 % or 150 % Windows scaling) collapses the side menu to its icons by itself, so the page keeps its room and nothing scrolls sideways; it opens again
// when the window widens, unless the person has used the toggle in the meantime. Acting only when the width CROSSES the limit keeps a person's own choice. Nothing is stored.
const NARROW_BELOW = 1100;
let wasNarrow: boolean | null = null;
let autoCollapsed = false;
let fitting = false;

function fit(): void {
  const narrow = window.innerWidth < NARROW_BELOW;
  if (narrow === wasNarrow) return;
  wasNarrow = narrow;
  fitting = true;
  if (narrow && !ui.sidebarCollapsed) {
    ui.sidebarCollapsed = true;
    autoCollapsed = true;
  } else if (!narrow && autoCollapsed) {
    ui.sidebarCollapsed = false;
    autoCollapsed = false;
  }
  fitting = false;
}

// synchronous, so that it runs while fit() is still changing the value and can tell the program's change from the person's
watch(() => ui.sidebarCollapsed, () => {
  if (!fitting) autoCollapsed = false;   // the person's own toggle wins
}, { flush: 'sync' });

onMounted(() => {
  fit();
  window.addEventListener('resize', fit);
});
onBeforeUnmount(() => window.removeEventListener('resize', fit));
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': ui.sidebarCollapsed }">
    <AppSidebar />
    <div class="app-main">
      <AppHeader />
      <main id="main-content" class="app-content" tabindex="-1">
        <slot />
      </main>
    </div>
  </div>
</template>
