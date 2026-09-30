<script setup lang="ts">
import { useModal } from '../composables/useModal';
import type { Tone } from '../jobs';
import AppIcon from './AppIcon.vue';

withDefaults(
  defineProps<{
    title: string;
    icon: string;
    tone: Tone;
    confirmLabel: string;
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
  <div ref="element" class="modal fade" tabindex="-1" aria-hidden="true" aria-labelledby="confirmTitle">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-body p-4">
          <div class="d-flex gap-3">
            <span :class="['confirm-icon', `confirm-icon-${tone}`]"><AppIcon :name="icon" /></span>
            <div class="flex-grow-1 min-w-0">
              <h2 id="confirmTitle" class="h5 mb-2">{{ title }}</h2>
              <slot></slot>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" :disabled="busy">Cancel</button>
          <button type="button" :class="['btn', `btn-${tone}`]" :disabled="busy || disabled" @click="emit('confirm')">
            <span v-if="busy" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            {{ busy ? busyLabel : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
