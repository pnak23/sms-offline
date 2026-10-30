import { isApiError } from '~/utils/apiError';

/** Turns backend codes into Khmer text: `error.<CODE>` for failures, `validation.<CODE>` for field problems. */
export function useApiError() {
  const { t, te } = useI18n();

  function errorText(code: string): string {
    return te(`error.${code}`) ? t(`error.${code}`) : t('error.UNKNOWN');
  }

  /** Text for any thrown value (unknown values read as a generic failure). */
  function messageFor(error: unknown): string {
    return isApiError(error) ? errorText(error.code) : errorText('UNKNOWN');
  }

  /** Text for a field problem code, e.g. PASSWORD_TOO_SHORT or Size. Falls back to a generic "invalid value". */
  function validationText(code: string | undefined): string {
    if (!code) return '';
    return te(`validation.${code}`) ? t(`validation.${code}`) : t('validation.INVALID');
  }

  return { errorText, messageFor, validationText };
}
