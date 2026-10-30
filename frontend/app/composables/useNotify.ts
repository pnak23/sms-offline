import { useToast } from 'bootstrap-vue-next/composables/useToast';

type ToastVariant = 'success' | 'danger' | 'warning' | 'info';

/** Toast notifications (bootstrap-vue-next). Call from a component's setup; the text must already be translated. */
export function useNotify() {
  const { create } = useToast();

  const show = (variant: ToastVariant, body: string, title?: string, timeMs = 5000) =>
    create({ body, title, variant, modelValue: timeMs, position: 'top-center', noProgress: true, solid: true, interval: 100 });

  return {
    success: (body: string, title?: string) => show('success', body, title),
    error: (body: string, title?: string) => show('danger', body, title, 9000),
    warning: (body: string, title?: string) => show('warning', body, title, 7000),
    info: (body: string, title?: string) => show('info', body, title),
  };
}
