import { getAppMetrics, listPrinters } from '~/services/desktop';
import type { HealthCheck } from '~/types/api';
import { isBundledFontLoaded } from '~/utils/fonts';

/**
 * Checks only the UI process can make: is the bundled Khmer font really loaded, which printers Windows has, and how
 * much memory the app uses. They are shaped like backend checks so the same rows display them.
 */
export function useClientChecks() {
  const fontLoaded = ref<boolean | null>(null);
  /** null = not asked yet or not available (plain browser) */
  const printers = ref<DesktopPrinter[] | null>(null);
  const printersAvailable = ref(true);
  const metrics = ref<DesktopMetrics | null>(null);

  async function run(): Promise<void> {
    fontLoaded.value = await isBundledFontLoaded();
    try {
      printers.value = await listPrinters();
      printersAvailable.value = true;
    } catch {
      printers.value = null;
      printersAvailable.value = false;
    }
    try {
      metrics.value = await getAppMetrics();
    } catch {
      metrics.value = null;
    }
  }

  const checks = computed<HealthCheck[]>(() => {
    const out: HealthCheck[] = [];
    if (fontLoaded.value !== null) {
      out.push({ id: 'FONTS', status: fontLoaded.value ? 'OK' : 'WARN', code: fontLoaded.value ? 'OK' : 'NOT_BUNDLED', params: {}, durationMs: 0 });
    }
    if (!printersAvailable.value) {
      out.push({ id: 'PRINTERS', status: 'INFO', code: 'UNAVAILABLE', params: {}, durationMs: 0 });
    } else if (printers.value) {
      const count = printers.value.length;
      out.push({ id: 'PRINTERS', status: 'INFO', code: count > 0 ? 'COUNT' : 'NONE', params: { count }, durationMs: 0 });
    }
    return out;
  });

  return { fontLoaded, printers, printersAvailable, metrics, checks, run };
}
