import { systemApi } from '~/services/systemApi';
import type { HealthReport, HealthStatus } from '~/types/api';

/** Loads the backend health report (quick or deep) with loading and error state. */
export function useHealthReport() {
  const { messageFor } = useApiError();
  const report = ref<HealthReport | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const status = computed<HealthStatus | null>(() => report.value?.status ?? null);

  async function run(kind: 'quick' | 'deep' = 'quick'): Promise<HealthReport | null> {
    loading.value = true;
    error.value = null;
    try {
      report.value = kind === 'deep' ? await systemApi.deepHealth() : await systemApi.health();
      return report.value;
    } catch (raised) {
      error.value = messageFor(raised);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return { report, loading, error, status, run };
}
