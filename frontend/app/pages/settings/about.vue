<script setup lang="ts">
import { getDesktop } from '~/services/desktop';
import { systemApi } from '~/services/systemApi';
import { useProductStore } from '~/stores/product';
import type { SystemInfo } from '~/types/api';

// About the system: who it is (from the one release file, through the backend: nothing is typed here), what it is built with, and what
// is still pending before the school accepts it. Works without the internet.
const { t } = useI18n();
const { messageFor } = useApiError();
const product = useProductStore();

const info = ref<SystemInfo | null>(null);
const shell = ref<DesktopInfo | null>(null);
const error = ref<string | null>(null);

async function load(): Promise<void> {
  error.value = null;
  try {
    await product.load();
    info.value = await systemApi.info();
    shell.value = await getDesktop().getInfo().catch(() => null);
  } catch (e) {
    error.value = messageFor(e);
  }
}

const technology = computed(() => {
  const rows: { key: string; value: string }[] = [];
  if (shell.value?.electron) rows.push({ key: 'shell', value: `Electron ${shell.value.electron}` });
  if (shell.value?.chromium) rows.push({ key: 'chromium', value: shell.value.chromium });
  if (info.value) {
    rows.push({ key: 'java', value: info.value.java });
    if (info.value.springBoot) rows.push({ key: 'spring', value: info.value.springBoot });
    if (info.value.sqlite) rows.push({ key: 'sqlite', value: info.value.sqlite });
    if (info.value.schemaVersion !== undefined) rows.push({ key: 'schema', value: String(info.value.schemaVersion) });
    if (info.value.os) rows.push({ key: 'os', value: info.value.os });
  }
  return rows;
});

onMounted(load);
useReloadOnReconnect(load);
</script>

<template>
  <div class="page-container" data-testid="about-page">
    <PageHeader :title="t('about.title')" :subtitle="t('about.subtitle')" />

    <StateBlock :loading="!product.info && !error" :error="error" @retry="load">
      <div v-if="product.info" class="row g-3">
        <div class="col-xl-6">
          <div class="card h-100"><div class="card-body">
            <h2 class="h5">{{ product.info.name }}</h2>
            <dl class="about-facts" data-testid="about-identity">
              <dt>{{ t('about.shortName') }}</dt><dd data-fact="shortName">{{ product.info.shortName }}</dd>
              <dt>{{ t('about.version') }}</dt><dd data-fact="version">{{ product.info.version }}</dd>
              <dt>{{ t('about.channel') }}</dt><dd data-fact="channel">{{ product.info.channel }}</dd>
              <dt>{{ t('about.developer') }}</dt><dd data-fact="developer">{{ product.info.developer }}</dd>
              <dt>{{ t('about.copyright') }}</dt><dd data-fact="copyright">{{ product.info.copyright }}</dd>
            </dl>
            <p class="text-muted small mb-0">{{ t('about.dataSafe') }}</p>
          </div></div>
        </div>
        <div class="col-xl-6">
          <div class="card h-100"><div class="card-body">
            <h2 class="h5">{{ t('about.technology') }}</h2>
            <dl class="about-facts" data-testid="about-technology">
              <template v-for="row in technology" :key="row.key">
                <dt>{{ t(`about.tech.${row.key}`) }}</dt><dd :data-fact="row.key">{{ row.value }}</dd>
              </template>
            </dl>
            <p class="text-muted small mb-0">{{ t('about.offline') }}</p>
          </div></div>
        </div>
      </div>
    </StateBlock>

    <ReadinessPanel />
  </div>
</template>
