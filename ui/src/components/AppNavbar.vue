<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import { useTheme } from '../composables/useTheme';
import { fromNow } from '../jobs';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  loading: boolean;
  lastUpdated: number | null;
  refreshSeconds: number;
}>();

const emit = defineEmits<{
  'update:refreshSeconds': [seconds: number];
  refresh: [];
  'new-job': [];
  'toggle-sidebar': [];
}>();

const REFRESH_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 s' },
  { value: 10, label: '10 s' },
  { value: 30, label: '30 s' },
  { value: 60, label: '1 min' },
  { value: 300, label: '5 min' },
];

const { preference, cycle } = useTheme();
const THEME_ICONS = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' };
const THEME_LABELS = { auto: 'Theme: follow the system', light: 'Theme: light', dark: 'Theme: dark' };

// Re-renders "updated … ago" while nothing else changes
const now = ref(Date.now());
const clock = setInterval(() => (now.value = Date.now()), 5000);
onBeforeUnmount(() => clearInterval(clock));

const updatedLabel = computed(() => {
  void now.value;
  return props.lastUpdated ? `Updated ${fromNow(props.lastUpdated)}` : '';
});

function onRefreshChange(event: Event) {
  emit('update:refreshSeconds', Number((event.target as HTMLSelectElement).value));
}
</script>

<template>
  <nav class="navbar app-navbar sticky-top">
    <div class="container-fluid gap-2 flex-nowrap">
      <button type="button" class="btn btn-icon d-md-none" aria-label="Show job types" @click="emit('toggle-sidebar')">
        <AppIcon name="menu" />
      </button>
      <a class="navbar-brand d-flex align-items-center gap-2 me-auto" href="./">
        <span class="app-logo"><AppIcon name="schedule" /></span>
        <span class="app-brand-name">Agendash</span>
      </a>

      <span class="small text-body-secondary d-none d-lg-inline" :title="lastUpdated ? new Date(lastUpdated).toLocaleString() : ''">{{ updatedLabel }}</span>

      <div class="input-group input-group-sm app-refresh" title="Auto-refresh interval">
        <span class="input-group-text"><AppIcon name="timer" /><span class="d-none d-sm-inline ms-1">Auto</span></span>
        <select class="form-select" aria-label="Auto-refresh interval" :value="refreshSeconds" @change="onRefreshChange">
          <option v-for="option in REFRESH_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
          <option v-if="!REFRESH_OPTIONS.some((option) => option.value === refreshSeconds)" :value="refreshSeconds">{{ refreshSeconds }} s</option>
        </select>
      </div>

      <button type="button" class="btn btn-icon" :disabled="loading" title="Refresh now" aria-label="Refresh now" @click="emit('refresh')">
        <AppIcon name="refresh" :class="{ 'app-spin': loading }" />
      </button>
      <button type="button" class="btn btn-icon" :title="THEME_LABELS[preference]" :aria-label="THEME_LABELS[preference]" @click="cycle">
        <AppIcon :name="THEME_ICONS[preference]" />
      </button>
      <!-- Extra controls from the host page, e.g. signing out -->
      <slot></slot>
      <button type="button" class="btn btn-primary btn-sm d-flex align-items-center gap-1 agendash-write" @click="emit('new-job')">
        <AppIcon name="add" /><span class="d-none d-sm-inline">New job</span>
      </button>
    </div>
  </nav>
</template>
