<script setup lang="ts">
import { JOB_STATES, type JobStateName, type OverviewEntry } from '../api';
import { STATE_META } from '../jobs';
import AppIcon from './AppIcon.vue';

defineProps<{
  counts: OverviewEntry | undefined;
  /** State filter in use, '' for none. */
  active: string;
}>();

const emit = defineEmits<{ select: [state: JobStateName | ''] }>();
</script>

<template>
  <div class="status-cards" role="group" aria-label="Filter by state">
    <button type="button" :class="['status-card', 'status-card-total', { active: active === '' }]" :aria-pressed="active === ''" @click="emit('select', '')">
      <span class="status-card-label"><AppIcon name="apps" /> Total</span>
      <span class="status-card-value">{{ counts?.total ?? 0 }}</span>
    </button>
    <button
      v-for="state in JOB_STATES"
      :key="state"
      type="button"
      :class="['status-card', `status-card-${STATE_META[state].tone}`, { active: active === state, empty: !counts?.[state] }]"
      :aria-pressed="active === state"
      :title="active === state ? 'Show every state' : `Show ${STATE_META[state].label.toLowerCase()} jobs`"
      @click="emit('select', active === state ? '' : state)"
    >
      <span class="status-card-label"><AppIcon :name="STATE_META[state].icon" /> {{ STATE_META[state].label }}</span>
      <span class="status-card-value">{{ counts?.[state] ?? 0 }}</span>
    </button>
  </div>
</template>
