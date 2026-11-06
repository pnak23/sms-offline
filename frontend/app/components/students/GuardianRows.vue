<script setup lang="ts">
import { type GuardianRowProblem, type GuardianRowValues, MAX_GUARDIANS } from '~/schemas/student';

// The guardians of a student: up to five rows, exactly one of them primary. The page checks the rows with guardianProblems().
const rows = defineModel<GuardianRowValues[]>({ required: true });
defineProps<{ problems: Record<number, GuardianRowProblem> }>();

const { t } = useI18n();
const { validationText } = useApiError();
const { relationshipOptions } = useLabels();

function add(): void {
  if (rows.value.length >= MAX_GUARDIANS) return;
  rows.value = [...rows.value, { nameKm: '', relationship: '', phone: '', primary: rows.value.length === 0 }];
}

function remove(index: number): void {
  const left = rows.value.filter((_, i) => i !== index);
  const hasPrimary = left.some((row) => row.primary);
  rows.value = left.map((row, i) => ({ ...row, primary: hasPrimary ? row.primary : i === 0 }));
}

function makePrimary(index: number): void {
  rows.value = rows.value.map((row, i) => ({ ...row, primary: i === index }));
}
</script>

<template>
  <div>
    <p v-if="rows.length === 0" class="text-muted">{{ t('students.noGuardians') }}</p>
    <div v-for="(row, index) in rows" :key="index" class="guardian-row">
      <div class="row g-2">
        <div class="col-md-4">
          <label :for="`guardian-name-${index}`" class="form-label">{{ t('students.guardianName') }}<span class="text-danger" aria-hidden="true"> *</span></label>
          <input :id="`guardian-name-${index}`" v-model="row.nameKm" class="form-control" :class="{ 'is-invalid': problems[index]?.nameKm }" maxlength="100" autocomplete="off" />
          <div v-if="problems[index]?.nameKm" class="field-error mt-1" role="alert">{{ validationText(problems[index]?.nameKm) }}</div>
        </div>
        <div class="col-md-3">
          <label :for="`guardian-rel-${index}`" class="form-label">{{ t('students.relationship') }}<span class="text-danger" aria-hidden="true"> *</span></label>
          <select :id="`guardian-rel-${index}`" v-model="row.relationship" class="form-select" :class="{ 'is-invalid': problems[index]?.relationship }">
            <option value="">{{ t('common.choose') }}</option>
            <option v-for="o in relationshipOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
          <div v-if="problems[index]?.relationship" class="field-error mt-1" role="alert">{{ validationText(problems[index]?.relationship) }}</div>
        </div>
        <div class="col-md-3">
          <label :for="`guardian-phone-${index}`" class="form-label">{{ t('common.phone') }}</label>
          <input :id="`guardian-phone-${index}`" v-model="row.phone" class="form-control" inputmode="tel" maxlength="50" autocomplete="off" />
        </div>
        <div class="col-md-2 d-flex align-items-end gap-2 pb-1">
          <div class="form-check mb-0">
            <input :id="`guardian-primary-${index}`" type="radio" class="form-check-input" name="guardian-primary" :checked="row.primary" @change="makePrimary(index)" />
            <label :for="`guardian-primary-${index}`" class="form-check-label">{{ t('students.primaryGuardian') }}</label>
          </div>
          <button type="button" class="btn btn-outline-danger btn-sm" :aria-label="t('students.removeGuardian')" :title="t('students.removeGuardian')" @click="remove(index)">
            <AppIcon name="trash" />
          </button>
        </div>
      </div>
    </div>
    <button v-if="rows.length < MAX_GUARDIANS" type="button" class="btn btn-outline-primary btn-sm" @click="add"><AppIcon name="plus-lg" />{{ t('students.addGuardian') }}</button>
  </div>
</template>
