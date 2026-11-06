<script setup lang="ts">
import { academicApi } from '~/services/academicApi';
import type { Subject } from '~/types/api';
import { isApiError } from '~/utils/apiError';
import { subjectTree } from '~/utils/subjectTree';

// Which subjects the school uses. Each switch saves at once (PUT /subjects/{id}/active with the row's version).
// The wizard only switches them. With `manage` (Settings -> Academic) a subject can also be added, renamed and (when nothing uses it) removed, in one clean list:
// a MAIN subject with its sub-subjects grouped under it (two levels). A sub-subject is added under its main subject and keeps it (it is deactivated and created
// again, never moved). The add / rename form is a pop-up, so it opens where you are instead of at the end of a long list.
const props = defineProps<{ manage?: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const { t } = useI18n();
const { messageFor } = useApiError();
const notify = useNotify();

const subjects = ref<Subject[]>([]);
const loaded = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busyId = ref<number | null>(null);

// the add / rename pop-up: `formSubject` = renaming it; `formParent` = a new sub-subject goes under it
const showForm = ref(false);
const formSubject = ref<Subject | null>(null);
const formParent = ref<Subject | null>(null);

const nodes = computed(() => subjectTree(subjects.value));
// A long list is shown a page at a time, by MAIN subject (a main subject and its sub-subjects always stay together). The wizard list is short and not paged.
const pager = usePagination(nodes, 'subjects');
const visibleNodes = computed(() => (props.manage ? pager.shown.value : nodes.value));
const rows = computed(() => visibleNodes.value.flatMap((node) => [{ subject: node.subject, sub: false, count: node.subs.length }, ...node.subs.map((s) => ({ subject: s, sub: true, count: 0 }))]));
const mains = computed(() => subjects.value.filter((s) => s.parentId === null));

// Removing: only a subject nothing uses (so before the school's official use, for example sample subjects), and a main subject only after its sub-subjects.
const removing = ref<Subject | null>(null);
const removeBusy = ref(false);
const confirmOpen = computed({
  get: () => removing.value !== null,
  set: (open) => {
    if (!open) removing.value = null;
  },
});
const hasSubs = (subject: Subject): boolean => subjects.value.some((s) => s.parentId === subject.id);
const removeTitle = (subject: Subject): string | undefined => (subject.inUse ? t('academic.subjects.cannotRemoveInUse') : hasSubs(subject) ? t('academic.subjects.cannotRemoveHasSubs') : undefined);

async function load(): Promise<void> {
  if (!loaded.value) loading.value = true; // later reloads keep the list on screen instead of flashing a spinner
  loadError.value = null;
  try {
    subjects.value = await academicApi.subjects();
    loaded.value = true;
  } catch (error) {
    loadError.value = messageFor(error);
  } finally {
    loading.value = false;
  }
}

async function toggle(subject: Subject, event: Event): Promise<void> {
  const active = (event.target as HTMLInputElement).checked;
  busyId.value = subject.id;
  try {
    const updated = await academicApi.setSubjectActive(subject.id, active, subject.version);
    subjects.value = subjects.value.map((s) => (s.id === updated.id ? updated : s));
    emit('changed');
  } catch (error) {
    (event.target as HTMLInputElement).checked = subject.active; // put the switch back
    if (isApiError(error) && error.code === 'OPTIMISTIC_LOCK') {
      await load();
      notify.warning(t('academic.subjects.reloaded'));
    } else {
      notify.error(messageFor(error));
    }
  } finally {
    busyId.value = null;
  }
}

function openCreate(parent: Subject | null = null): void {
  formSubject.value = null;
  formParent.value = parent;
  showForm.value = true;
}

function openEdit(subject: Subject): void {
  formSubject.value = subject;
  formParent.value = null;
  showForm.value = true;
}

/** After adding or renaming: reload, and show the page the subject is on (a sub-subject's page is its main subject's). */
async function saved(subject: Subject): Promise<void> {
  await load();
  const at = nodes.value.findIndex((node) => node.subject.id === (subject.parentId ?? subject.id));
  if (at >= 0) pager.goToIndex(at);
  emit('changed');
}

async function removeConfirmed(): Promise<void> {
  const target = removing.value;
  if (!target) return;
  removeBusy.value = true;
  try {
    await academicApi.removeSubject(target.id);
    notify.success(t('academic.subjects.removed'));
    await load();
    emit('changed');
  } catch (error) {
    notify.error(messageFor(error));
    await load();
  } finally {
    removing.value = null;
    removeBusy.value = false;
  }
}

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <section>
    <div class="subject-head">
      <div>
        <h3 class="h5 mb-1">{{ t('academic.subjects.title') }}</h3>
        <p class="text-muted mb-0">{{ t('academic.subjects.intro') }}</p>
      </div>
      <button v-if="manage" type="button" class="btn btn-primary btn-sm text-nowrap" data-testid="subject-add" @click="openCreate()">
        <AppIcon name="plus-lg" />{{ t('academic.subjects.add') }}
      </button>
    </div>
    <ul v-if="manage" class="subject-legend text-muted small">
      <li>{{ t('academic.subjects.legendSwitch') }}</li>
      <li>{{ t('academic.subjects.legendSub') }}</li>
      <li>{{ t('academic.subjects.legendRemove') }}</li>
    </ul>

    <StateBlock :loading="loading" :error="loadError" :empty="subjects.length === 0" @retry="load">
      <ul class="subject-list" :class="{ 'subject-list-manage': manage }">
        <li
          v-for="{ subject, sub, count } in rows"
          :key="subject.id"
          class="subject-item"
          :class="{ 'subject-sub': sub, 'subject-off': !subject.active }"
          :data-kind="sub ? 'sub' : 'main'"
        >
          <div class="subject-row">
            <div class="form-check form-switch subject-switch">
              <input
                :id="`subject-${subject.id}`"
                type="checkbox"
                role="switch"
                class="form-check-input"
                :checked="subject.active"
                :disabled="busyId === subject.id"
                @change="toggle(subject, $event)"
              />
              <label :for="`subject-${subject.id}`" class="form-check-label">
                <span class="subject-name">{{ subject.nameKm }}</span>
                <span v-if="subject.nameEn" class="subject-en">{{ subject.nameEn }}</span>
              </label>
            </div>
            <span v-if="manage && !sub && count > 0" class="subject-count">{{ t('academic.subjects.subCount', { count }) }}</span>
            <div v-if="manage" class="subject-actions">
              <button v-if="!sub" type="button" class="btn btn-outline-primary btn-sm text-nowrap" :data-add-sub="subject.nameKm" @click="openCreate(subject)">
                <AppIcon name="plus-lg" />{{ t('academic.subjects.addSub') }}
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm subject-icon" :aria-label="t('academic.subjects.rename')" :title="t('academic.subjects.rename')" @click="openEdit(subject)">
                <AppIcon name="pencil" />
              </button>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm subject-icon"
                :aria-label="t('academic.subjects.remove')"
                :data-remove="subject.nameKm"
                :disabled="subject.inUse || hasSubs(subject) || removeBusy"
                :title="removeTitle(subject) ?? t('academic.subjects.remove')"
                @click="removing = subject"
              >
                <AppIcon name="trash" />
              </button>
            </div>
          </div>
        </li>
      </ul>
      <ListPager
        v-if="manage"
        v-model:page="pager.page.value"
        v-model:size="pager.size.value"
        :total="pager.total.value"
        :page-count="pager.pageCount.value"
        :from="pager.range.value.from"
        :to="pager.range.value.to"
        :unit="t('academic.subjects.unit')"
        test-id="subjects-pager"
      />
    </StateBlock>

    <SubjectFormModal v-model="showForm" :subject="formSubject" :parent="formParent" :mains="mains" @saved="saved" @stale="load" />
    <ConfirmModal
      v-model="confirmOpen"
      :title="t('academic.subjects.removeTitle')"
      :message="t('academic.subjects.removeMessage', { subject: removing?.nameKm ?? '' })"
      :confirm-label="t('common.remove')"
      :loading="removeBusy"
      @confirm="removeConfirmed"
    />
  </section>
</template>
