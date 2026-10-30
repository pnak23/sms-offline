import type { HealthCheck, HealthReport, HealthStatus } from '../types/api';

const RANK: Record<HealthStatus, number> = { OK: 0, INFO: 1, WARN: 2, FAIL: 3 };

export function worstStatus(statuses: HealthStatus[]): HealthStatus {
  return statuses.reduce<HealthStatus>((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'OK');
}

export function needsAttention(status: HealthStatus): boolean {
  return status === 'WARN' || status === 'FAIL';
}

/** Bootstrap Icons names (see app/config/icons.json). */
export function healthIcon(status: HealthStatus): string {
  switch (status) {
    case 'OK':
      return 'check-circle-fill';
    case 'WARN':
      return 'exclamation-triangle-fill';
    case 'FAIL':
      return 'x-circle-fill';
    default:
      return 'info-circle-fill';
  }
}

/** Bootstrap contextual colour name. */
export function healthVariant(status: HealthStatus): 'success' | 'warning' | 'danger' | 'secondary' {
  switch (status) {
    case 'OK':
      return 'success';
    case 'WARN':
      return 'warning';
    case 'FAIL':
      return 'danger';
    default:
      return 'secondary';
  }
}

export function findCheck(report: HealthReport | null, id: string): HealthCheck | undefined {
  return report?.checks.find((c) => c.id === id);
}

/** i18n keys for one check: a title per check id and a sentence per (id, code). */
export function checkTitleKey(check: HealthCheck): string {
  return `health.checks.${check.id}.title`;
}

/** Candidates in order: a sentence for this exact (check, code), then a generic one for the code (e.g. CHECK_ERROR). */
export function checkMessageKeys(check: HealthCheck): string[] {
  return [`health.checks.${check.id}.${check.code}`, `health.codes.${check.code}`];
}
