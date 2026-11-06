<script setup lang="ts">
import { teachersApi } from '~/services/teachersApi';
import type { Teacher } from '~/types/api';
import { DATA_PAGE_DEFAULT, DATA_PAGE_SIZES } from '~/utils/pagination';
import { sortByKhmer } from '~/utils/sort';

// Teachers: search by name, code, phone or specialisation, filter by status, add. A row opens the teacher's profile.
const { t } = useI18n();
const { messageFor } = useApiError();
const { teacherStatusLabel, genderLabel } = useLabels();

const q = ref('');
const status = ref('ACTIVE');
const teachers = ref<Teacher[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const showForm = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
// the list is shown a page at a time
const pager = usePagination(teachers, 'teachers', { fallback: DATA_PAGE_DEFAULT });

async function load(): Promise<void> {
  loadError.value = null;
  try {
    teachers.value = sortByKhmer(await teachersApi.list({ q: q.value, status: status.value }), (teacher) => teacher.nameKm);
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

/** After adding a teacher: reload, and show the page the new teacher is on. */
async function saved(teacher: Teacher): Promise<void> {
  await load();
  const at = teachers.value.findIndex((row) => row.id === teacher.id);
  if (at >= 0) pager.goToIndex(at);
}

// typing in the search box asks the server a moment after the last key, not on every key
watch([q, status], () => {
  pager.reset(); // a new search or filter is a new list: start at its first page
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
onBeforeUnmount(() => clearTimeout(timer));
onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container">
    <PageHeader :title="t('teachers.title')" :subtitle="t('teachers.subtitle')">
      <button type="button" class="btn btn-primary" @click="showForm = true"><AppIcon name="plus-lg" />{{ t('teachers.add') }}</button>
    </PageHeader>

    <div class="card">
      <div class="card-body">
        <div class="filter-bar">
          <div class="filter-search">
            <label for="teacher-search" class="visually-hidden">{{ t('common.search') }}</label>
            <input id="teacher-search" v-model="q" type="search" class="form-control" :placeholder="t('teachers.searchHint')" autocomplete="off" />
          </div>
          <div>
            <label for="teacher-status" class="visually-hidden">{{ t('common.status') }}</label>
            <select id="teacher-status" v-model="status" class="form-select">
              <option value="">{{ t('common.all') }}</option>
              <option value="ACTIVE">{{ teacherStatusLabel('ACTIVE') }}</option>
              <option value="INACTIVE">{{ teacherStatusLabel('INACTIVE') }}</option>
            </select>
          </div>
        </div>

        <StateBlock :loading="loading" :error="loadError" :empty="teachers.length === 0" :empty-text="t('teachers.empty')" @retry="load">
          <div class="table-responsive scroll-x">
            <table class="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>{{ t('teachers.code') }}</th>
                  <th>{{ t('teachers.nameKm') }}</th>
                  <th>{{ t('common.gender') }}</th>
                  <th>{{ t('common.phone') }}</th>
                  <th>{{ t('teachers.specialization') }}</th>
                  <th>{{ t('common.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="teacher in pager.shown.value" :key="teacher.id">
                  <td class="text-nowrap">{{ teacher.teacherCode }}</td>
                  <td class="fw-medium"><NuxtLink :to="`/teachers/${teacher.id}`">{{ teacher.nameKm }}</NuxtLink></td>
                  <td>{{ genderLabel(teacher.gender) }}</td>
                  <td class="text-nowrap">{{ teacher.phone ?? '—' }}</td>
                  <td>{{ teacher.specialization ?? '—' }}</td>
                  <td>
                    <span class="badge" :class="teacher.status === 'ACTIVE' ? 'text-bg-success' : 'text-bg-secondary'">{{ teacherStatusLabel(teacher.status) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ListPager
            v-model:page="pager.page.value"
            v-model:size="pager.size.value"
            :total="pager.total.value"
            :page-count="pager.pageCount.value"
            :from="pager.range.value.from"
            :to="pager.range.value.to"
            :sizes="DATA_PAGE_SIZES"
            :unit="t('teachers.unit')"
            test-id="teachers-pager"
          />
        </StateBlock>
      </div>
    </div>

    <TeacherFormModal v-model="showForm" :teacher="null" @saved="saved" />
  </div>
</template>
