<script setup lang="ts">
import type { AuditRow } from '~/types/api';
import { formatDateTimeKm } from '~/utils/date';

// One row per thing that happened: when, who, what (in Khmer, from the code), and the technical detail in small type.
defineProps<{ rows: AuditRow[] }>();

const { t, te } = useI18n();

/** A code the Khmer text does not know yet (a later version's) is shown as it is rather than hidden. */
function actionLabel(code: string): string {
  const key = `audit.action.${code}`;
  return te(key) ? t(key) : code;
}

function entityLabel(row: AuditRow): string {
  if (!row.entityType) return '—';
  const key = `audit.entity.${row.entityType}`;
  const name = te(key) ? t(key) : row.entityType;
  return row.entityId === null ? name : `${name} #${row.entityId}`;
}

function actorLabel(actor: string | null): string {
  return !actor || actor === 'system' ? t('audit.system') : actor;
}
</script>

<template>
  <div class="table-responsive scroll-x">
    <table class="table table-sm align-middle mb-0" data-testid="audit-table">
      <thead>
        <tr>
          <th>{{ t('audit.col.when') }}</th>
          <th>{{ t('audit.col.who') }}</th>
          <th>{{ t('audit.col.action') }}</th>
          <th>{{ t('audit.col.what') }}</th>
          <th>{{ t('audit.col.detail') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" data-testid="audit-row" :data-action="row.action">
          <td class="text-nowrap">{{ formatDateTimeKm(row.at) }}</td>
          <td class="text-nowrap">{{ actorLabel(row.actor) }}</td>
          <td class="fw-medium">{{ actionLabel(row.action) }}</td>
          <td class="text-nowrap">{{ entityLabel(row) }}</td>
          <td class="text-muted small" lang="en">{{ row.summary }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
