import { ApiError, isApiError, toFormErrors } from '~/utils/apiError';

export interface SubmitOptions {
  /** Form field names; server field errors for anything else become the banner message instead. */
  fields: string[];
  /** vee-validate's `setErrors` (each value is a validation code). */
  setErrors?: (errors: Record<string, string>) => void;
  /** Server field name -> form field name (e.g. `{ newPassword: 'password' }`). */
  aliases?: Record<string, string>;
}

/**
 * Runs a submit action and sorts the outcome the same way for every form: field errors go onto the fields, ACCOUNT_LOCKED
 * starts a visible countdown, anything else becomes one banner message. Returns the action's value, or `undefined` on failure.
 */
export function useSubmit(options: SubmitOptions) {
  const { messageFor } = useApiError();
  const lock = useCountdownState();
  const submitting = ref(false);
  const lastError = ref<ApiError | null>(null);

  // A lock-out is shown by the countdown (FormAlert), never as a text message that would outlive it.
  const formError = computed(() => (lastError.value && !lastError.value.isLocked ? messageFor(lastError.value) : null));

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    submitting.value = true;
    lastError.value = null;
    try {
      return await action();
    } catch (raised) {
      const error = isApiError(raised) ? raised : new ApiError(500, 'UNKNOWN');
      handle(error);
      return undefined;
    } finally {
      submitting.value = false;
    }
  }

  function handle(error: ApiError): void {
    if (error.isLocked) {
      lock.start(error.retryAfterSeconds ?? 60);
      lastError.value = error;
      return;
    }
    const mapped = toFormErrors(error, options.aliases);
    const onForm = Object.keys(mapped).filter((field) => options.fields.includes(field));
    if (onForm.length > 0) {
      options.setErrors?.(Object.fromEntries(onForm.map((field) => [field, mapped[field] as string])));
      if (onForm.length === Object.keys(mapped).length) return; // everything is visible next to a field
    }
    lastError.value = error;
  }

  function clearError(): void {
    lastError.value = null;
  }

  return {
    submitting,
    formError,
    lastError,
    lockedSeconds: lock.remaining,
    isLocked: lock.active,
    lockLabel: lock.label,
    run,
    clearError,
  };
}
