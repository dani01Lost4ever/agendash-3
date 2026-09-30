import Modal from 'bootstrap/js/dist/modal';
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Wraps a Bootstrap modal rendered by the calling component.
 * Bind `element` with `ref="element"` on the `.modal` element.
 */
export function useModal(handlers: { onShown?: () => void; onHidden?: () => void } = {}) {
  const element = ref<HTMLElement | null>(null);
  let modal: Modal | undefined;

  const shown = () => handlers.onShown?.();
  const hidden = () => handlers.onHidden?.();

  onMounted(() => {
    if (!element.value) return;
    modal = new Modal(element.value);
    element.value.addEventListener('shown.bs.modal', shown);
    element.value.addEventListener('hidden.bs.modal', hidden);
  });

  onBeforeUnmount(() => {
    element.value?.removeEventListener('shown.bs.modal', shown);
    element.value?.removeEventListener('hidden.bs.modal', hidden);
    modal?.dispose();
  });

  return {
    element,
    show: () => modal?.show(),
    hide: () => modal?.hide(),
  };
}
