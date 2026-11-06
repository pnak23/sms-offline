<script setup lang="ts">
import { usePreferencesStore } from '~/stores/preferences';
import { useSchoolStore } from '~/stores/school';

// The top of every printed page: the optional national / ministry lines (Settings -> Printed reports), then the school's logo, name and address.
// A page may leave the logo or the national lines out (the report card's own options); everywhere else both show as before.
withDefaults(defineProps<{ showLogo?: boolean; showNational?: boolean }>(), { showLogo: true, showNational: true });

const school = useSchoolStore();
const preferences = usePreferencesStore();
</script>

<template>
  <header class="print-head">
    <div v-if="showNational && preferences.moeysHeader && preferences.headerLines.length > 0" class="print-national" data-testid="print-national">
      <p v-for="(line, index) in preferences.headerLines" :key="index" :class="index === 0 ? 'print-national-main' : 'print-national-sub'">{{ line }}</p>
    </div>
    <div class="student-sheet-head">
      <img v-if="showLogo && school.logoUrl" :src="school.logoUrl" class="student-sheet-logo" alt="" />
      <div>
        <p v-if="school.hasName" class="student-sheet-school">{{ school.name }}</p>
        <p v-if="school.profile?.address" class="student-sheet-address">{{ school.profile.address }}</p>
      </div>
    </div>
  </header>
</template>
