import { readonly, ref } from 'vue';

export type ToastTone = 'success' | 'danger' | 'warning' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

function dismiss(id: number) {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
}

/** Shows `message` for a few seconds; errors stay longer. */
function notify(message: string, tone: ToastTone = 'success') {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, tone, message }];
  setTimeout(() => dismiss(id), tone === 'danger' ? 8000 : 4000);
}

/** Notifications shared by the whole dashboard. */
export function useToasts() {
  return { toasts: readonly(toasts), notify, dismiss };
}
