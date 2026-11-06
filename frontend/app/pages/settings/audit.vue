<script setup lang="ts">
import { auditApi } from '~/services/auditApi';
import type { AuditFilters, AuditQuery, AuditRow } from '~/types/api';
import { sortByKhmer } from '~/utils/sort';

// The audit trail: everything that was added, changed or removed, newest first. Read only: nothing on this page can change it.
const { t, te } = useI18n();
const { messageFor } = useApiError();

const PAGE = 50;

const filters = ref<AuditFilters>({ actions: [], actors: [], entityTypes: [] });
const rows = ref<AuditRow[]>([]);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref<string | null>(null);

// the values in the form; `applied` is what the list was last loaded with (so "load more" continues the same search)
const form = reactive({ from: '', to: '', action: '', actor: '', entityType: '' });
const applied = ref<AuditQuery>({});

const rangeInvalid = computed(() => !!form.from && !!form.to && form.from > form.to);

function label(prefix: string, code: string): string {
  const key = `${prefix}.${code}`;
  return te(key) ? t(key) : code;
}

const actionOptions = computed(() => sortByKhmer(filters.value.actions.map((c) => ({ code: c, text: label('audit.action', c) })), (o) => o.text));
const entityOptions = computed(() => sortByKhmer(filters.value.entityTypes.map((c) => ({ code: c, text: label('audit.entity', c) })), (o) => o.text));

async function loadFirst(): Promise<void> {
  if (rangeInvalid.value) return;
  loading.value = true;
  loadError.value = null;
  applied.value = { from: form.from, to: form.to, action: form.action, actor: form.actor, entityType: form.entityType, limit: PAGE };
  try {
    const page = await auditApi.list(applied.value);
    rows.value = page.rows;
    hasMore.value = page.hasMore;
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  const last = rows.value[rows.value.length - 1];
  if (!last) return;
  loadingMore.value = true;
  try {
    const page = await auditApi.list({ ...applied.value, beforeId: last.id });
    rows.value = [...rows.value, ...page.rows];
    hasMore.value = page.hasMore;
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loadingMore.value = false;
  }
}

function reset(): void {
  Object.assign(form, { from: '', to: '', action: '', actor: '', entityType: '' });
  void loadFirst();
}

onMounted(async () => {
  try {
    filters.value = await auditApi.filters();
  } catch {
    // the filters are a convenience; the list below reports a real problem
  }
  await loadFirst();
});
useReloadOnReconnect(loadFirst);
</script>

<template>
  <div class="page-container" data-testid="audit-page">
    <PageHeader :title="t('audit.title')" :subtitle="t('audit.subtitle')" />

    <form class="card mb-3" novalidate data-testid="audit-filters" @submit.prevent="loadFirst">
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-sm-6 col-lg-2">
            <label class="form-label" for="audit-from">{{ t('audit.filter.from') }}</label>
            <input id="audit-from" v-model="form.from" type="date" class="form-control" :class="{ 'is-invalid': rangeInvalid }" />
          </div>
          <div class="col-sm-6 col-lg-2">
            <label class="form-label" for="audit-to">{{ t('audit.filter.to') }}</label>
            <input id="audit-to" v-model="form.to" type="date" class="form-control" :class="{ 'is-invalid': rangeInvalid }" />
          </div>
          <div class="col-sm-6 col-lg-3">
            <label class="form-label" for="audit-action">{{ t('audit.filter.action') }}</label>
            <select id="audit-action" v-model="form.action" class="form-select">
              <option value="">{{ t('audit.filter.all') }}</option>
              <option v-for="o in actionOptions" :key="o.code" :value="o.code">{{ o.text }}</option>
            </select>
          </div>
          <div class="col-sm-6 col-lg-2">
            <label class="form-label" for="audit-entity">{{ t('audit.filter.entity') }}</label>
            <select id="audit-entity" v-model="form.entityType" class="form-select">
              <option value="">{{ t('audit.filter.all') }}</option>
              <option v-for="o in entityOptions" :key="o.code" :value="o.code">{{ o.text }}</option>
            </select>
          </div>
          <div class="col-sm-6 col-lg-2">
            <label class="form-label" for="audit-actor">{{ t('audit.filter.actor') }}</label>
            <select id="audit-actor" v-model="form.actor" class="form-select">
              <option value="">{{ t('audit.filter.all') }}</option>
              <option v-for="a in filters.actors" :key="a" :value="a">{{ a === 'system' ? t('audit.system') : a }}</option>
            </select>
          </div>
          <div class="col-12 d-flex gap-2">
            <button type="submit" class="btn btn-primary" :disabled="rangeInvalid || loading" data-testid="audit-apply">{{ t('audit.filter.apply') }}</button>
            <button type="button" class="btn btn-outline-secondary" :disabled="loading" data-testid="audit-reset" @click="reset">{{ t('audit.filter.reset') }}</button>
            <span v-if="rangeInvalid" class="text-danger align-self-center small" role="alert">{{ t('audit.filter.rangeInvalid') }}</span>
          </div>
        </div>
      </div>
    </form>

    <div class="card">
      <div class="card-body">
        <StateBlock :loading="loading" :error="loadError" :empty="rows.length === 0" :empty-text="t('audit.empty')" @retry="loadFirst">
          <AuditTable :rows="rows" />
          <div v-if="hasMore" class="text-center mt-3">
            <LoadingButton variant="outline-secondary" icon="arrow-clockwise" :loading="loadingMore" data-testid="audit-more" @click="loadMore">{{ t('audit.more') }}</LoadingButton>
          </div>
        </StateBlock>
      </div>
    </div>
  </div>
</template>
