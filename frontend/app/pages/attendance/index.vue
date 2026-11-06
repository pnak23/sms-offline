<script setup lang="ts">
// Attendance: take or correct a day for a class, or look back over a period. The academic year and class are chosen once for both tabs.
const { t } = useI18n();

const { years, classes, yearId, classId, year, closed, loading, error, load } = useClassPicker();
const tab = ref<'take' | 'history'>('take');

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('attendance.title')" :subtitle="t('attendance.subtitle')" />

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="loading" :error="error" @retry="load">
          <p v-if="years.length === 0" class="mb-0">
            {{ t('classes.noYear') }} <NuxtLink to="/settings/academic">{{ t('nav.academic') }}</NuxtLink>
          </p>
          <template v-else>
            <div class="filter-bar">
              <ClassPicker v-model:year-id="yearId" v-model:class-id="classId" :years="years" :classes="classes" />
            </div>

            <ul class="nav nav-tabs mb-3" role="tablist">
              <li class="nav-item" role="presentation">
                <button id="attendance-tab-take" type="button" class="nav-link" :class="{ active: tab === 'take' }" role="tab" :aria-selected="tab === 'take'" @click="tab = 'take'">
                  {{ t('attendance.tabTake') }}
                </button>
              </li>
              <li class="nav-item" role="presentation">
                <button id="attendance-tab-history" type="button" class="nav-link" :class="{ active: tab === 'history' }" role="tab" :aria-selected="tab === 'history'" @click="tab = 'history'">
                  {{ t('attendance.tabHistory') }}
                </button>
              </li>
            </ul>

            <!-- kept mounted (only hidden) so choices that are not saved yet survive a look at the history -->
            <AttendanceEntry v-show="tab === 'take'" v-model:class-id="classId" :closed="closed" :year="year" />
            <AttendanceHistory v-if="tab === 'history'" :class-id="classId" />
          </template>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
