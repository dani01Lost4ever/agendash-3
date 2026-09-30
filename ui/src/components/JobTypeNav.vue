<script setup lang="ts">
import Offcanvas from 'bootstrap/js/dist/offcanvas';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import type { OverviewEntry } from '../api';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  /** Per job name, without the totals entry. */
  types: OverviewEntry[];
  total: number;
  /** Selected job name, '' for all jobs. */
  selected: string;
  loading: boolean;
}>();

const emit = defineEmits<{ select: [name: string] }>();

const element = ref<HTMLElement | null>(null);
let offcanvas: Offcanvas | undefined;

onMounted(() => {
  if (element.value) offcanvas = new Offcanvas(element.value);
});
onBeforeUnmount(() => offcanvas?.dispose());

const filter = ref('');
const visibleTypes = computed(() => {
  const text = filter.value.trim().toLowerCase();
  const sorted = [...props.types].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return text ? sorted.filter((type) => type.displayName.toLowerCase().includes(text)) : sorted;
});

const SEGMENTS = [
  { state: 'scheduled', tone: 'info' },
  { state: 'queued', tone: 'primary' },
  { state: 'running', tone: 'warning' },
  { state: 'completed', tone: 'success' },
  { state: 'failed', tone: 'danger' },
] as const;

// Segments grow with the log of their count so small states stay visible
function grow(count: number) {
  return Math.log2(1 + (count || 0));
}

function select(name: string) {
  emit('select', name);
  offcanvas?.hide();
}

defineExpose({ toggle: () => offcanvas?.toggle() });
</script>

<template>
  <aside ref="element" class="offcanvas-md offcanvas-start app-sidebar" tabindex="-1" aria-labelledby="jobTypesTitle">
    <div class="offcanvas-header border-bottom">
      <h2 id="jobTypesTitle" class="offcanvas-title h6 mb-0">Job types</h2>
      <button type="button" class="btn-close" aria-label="Close" @click="offcanvas?.hide()"></button>
    </div>
    <div class="offcanvas-body">
      <div class="app-sidebar-inner">
        <div class="app-search mb-3">
          <AppIcon name="filter_list" />
          <input v-model="filter" type="search" class="form-control form-control-sm" placeholder="Filter job types" aria-label="Filter job types" />
        </div>

        <button type="button" :class="['job-type', { active: selected === '' }]" @click="select('')">
          <AppIcon name="apps" class="job-type-icon" />
          <span class="job-type-name">All jobs</span>
          <span class="job-type-count">{{ total }}</span>
        </button>

        <div class="app-sidebar-label">Job types</div>

        <div v-if="loading && types.length === 0" class="text-body-secondary small px-2 py-3">Loading…</div>
        <div v-else-if="visibleTypes.length === 0" class="text-body-secondary small px-2 py-3">
          {{ filter ? 'No job type matches' : 'No jobs yet' }}
        </div>

        <button
          v-for="type in visibleTypes"
          :key="type.displayName"
          type="button"
          :class="['job-type', { active: selected === type.displayName }]"
          :title="type.displayName"
          @click="select(type.displayName)"
        >
          <span class="job-type-main">
            <span class="job-type-name">{{ type.displayName }}</span>
            <span v-if="type.failed" class="job-type-flag text-danger" :title="`${type.failed} failed`"><AppIcon name="error" /></span>
            <span v-if="type.running" class="job-type-flag text-warning" :title="`${type.running} running`"><AppIcon name="autorenew" class="app-spin" /></span>
            <span v-if="type.disabled" class="job-type-flag text-body-secondary" :title="`${type.disabled} disabled`"><AppIcon name="pause_circle" /></span>
            <span class="job-type-count">{{ type.total }}</span>
          </span>
          <span class="job-type-bar" aria-hidden="true">
            <span
              v-for="segment in SEGMENTS"
              :key="segment.state"
              :class="`bg-${segment.tone}`"
              :style="{ flexGrow: grow(type[segment.state]) }"
            ></span>
          </span>
        </button>
      </div>
    </div>
  </aside>
</template>
