<script setup lang="ts">
import { useModal } from '../composables/useModal';

withDefaults(
  defineProps<{
    title: string;
    titleIcon: string;
    tone: 'danger' | 'primary';
    confirmLabel: string;
    confirmIcon: string;
    busyLabel: string;
    busy?: boolean;
    disabled?: boolean;
  }>(),
  { busy: false, disabled: false },
);

const emit = defineEmits<{ confirm: [] }>();

const { element, show, hide } = useModal();

defineExpose({ open: show, hide });
</script>

<template>
  <div ref="element" class="modal fade" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content shadow-lg">
        <div :class="['modal-header', 'text-white', `bg-${tone}`]">
          <h5 class="modal-title">
            <i class="material-icons md-18 align-middle me-1">{{ titleIcon }}</i> {{ title }}
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <slot></slot>
        </div>
        <div class="modal-footer bg-light border-top">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" :disabled="busy">Cancel</button>
          <button type="button" :class="['btn', `btn-${tone}`]" :disabled="busy || disabled" @click="emit('confirm')">
            <span v-if="busy" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <i v-else class="material-icons md-18 align-middle me-1">{{ confirmIcon }}</i>
            {{ busy ? busyLabel : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
