<script setup lang="ts">
import { useToasts, type ToastTone } from '../composables/useToasts';
import AppIcon from './AppIcon.vue';

const { toasts, dismiss } = useToasts();

const ICONS: Record<ToastTone, string> = {
  success: 'check_circle',
  danger: 'error',
  warning: 'warning',
  info: 'info',
};
</script>

<template>
  <div class="toast-container position-fixed end-0 p-3 app-toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast-slide">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast show align-items-center border-0', `app-toast-${toast.tone}`]"
        :role="toast.tone === 'danger' ? 'alert' : 'status'"
      >
        <div class="d-flex align-items-start gap-2 p-3">
          <AppIcon :name="ICONS[toast.tone]" class="app-toast-icon" />
          <div class="flex-grow-1 app-toast-message">{{ toast.message }}</div>
          <button type="button" class="btn-close btn-sm" aria-label="Dismiss" @click="dismiss(toast.id)"></button>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>
