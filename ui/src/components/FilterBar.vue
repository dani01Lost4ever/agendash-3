<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { JOB_STATES } from '../api';
import type { Filters } from '../filters';
import { STATE_META } from '../jobs';
import AppIcon from './AppIcon.vue';

const props = defineProps<{ filters: Filters }>();

const emit = defineEmits<{
  update: [changes: Partial<Filters>];
  clear: [];
}>();

const search = ref(props.filters.search);
const property = ref(props.filters.property);
const value = ref(props.filters.q);
const isObjectId = ref(props.filters.isObjectId);
const showAdvanced = ref(Boolean(props.filters.property || props.filters.q));

// Follow changes made elsewhere: the sidebar, "clear filters", the URL
watch(() => props.filters.search, (text) => (search.value = text));
watch(() => props.filters.property, (text) => (property.value = text));
watch(() => props.filters.q, (text) => (value.value = text));
watch(() => props.filters.isObjectId, (flag) => (isObjectId.value = flag));

let debounce: ReturnType<typeof setTimeout> | undefined;
function onSearchInput() {
  clearTimeout(debounce);
  debounce = setTimeout(applySearch, 350);
}
function applySearch() {
  clearTimeout(debounce);
  if (search.value.trim() !== props.filters.search) {
    // A name search replaces the job type picked in the sidebar
    emit('update', { search: search.value.trim(), job: '' });
  }
}
onBeforeUnmount(() => clearTimeout(debounce));

function applyData() {
  emit('update', { property: property.value.trim(), q: value.value.trim(), isObjectId: isObjectId.value });
}

function clearData() {
  property.value = '';
  value.value = '';
  isObjectId.value = false;
  applyData();
}

const dataFilterActive = computed(() => Boolean(props.filters.property && props.filters.q));
const anyActive = computed(
  () => Boolean(props.filters.job || props.filters.search || props.filters.state || dataFilterActive.value),
);
</script>

<template>
  <div class="filter-bar card">
    <div class="card-body">
      <div class="d-flex flex-wrap gap-2 align-items-center">
        <div class="app-search flex-grow-1">
          <AppIcon name="search" />
          <input
            v-model="search"
            type="search"
            class="form-control"
            placeholder="Search job names, or /regex/"
            aria-label="Search job names"
            @input="onSearchInput"
            @keydown.enter.prevent="applySearch"
          />
        </div>
        <select
          class="form-select filter-state"
          aria-label="State"
          :value="filters.state"
          @change="emit('update', { state: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">Any state</option>
          <option v-for="state in JOB_STATES" :key="state" :value="state">{{ STATE_META[state].label }}</option>
        </select>
        <button
          type="button"
          :class="['btn', 'd-flex', 'align-items-center', 'gap-1', showAdvanced || dataFilterActive ? 'btn-secondary' : 'btn-outline-secondary']"
          :aria-expanded="showAdvanced"
          aria-controls="dataFilter"
          @click="showAdvanced = !showAdvanced"
        >
          <AppIcon name="data_object" /> Data filter
          <span v-if="dataFilterActive" class="badge rounded-pill text-bg-primary">1</span>
        </button>
        <button v-if="anyActive" type="button" class="btn btn-link text-decoration-none px-1" @click="emit('clear')">
          Clear filters
        </button>
      </div>

      <form v-show="showAdvanced" id="dataFilter" class="data-filter row g-2 align-items-end mt-1" @submit.prevent="applyData">
        <div class="col-12 col-md-4">
          <label class="form-label small text-body-secondary mb-1" for="filterProperty">Property</label>
          <input id="filterProperty" v-model="property" type="text" class="form-control form-control-sm" placeholder="e.g. data.userId" />
        </div>
        <div class="col-12 col-md-4">
          <label class="form-label small text-body-secondary mb-1" for="filterValue">Value</label>
          <input id="filterValue" v-model="value" type="text" class="form-control form-control-sm" placeholder="Text, number or /regex/" />
        </div>
        <div class="col-auto">
          <div class="form-check mb-1">
            <input id="filterObjectId" v-model="isObjectId" type="checkbox" class="form-check-input" />
            <label class="form-check-label small" for="filterObjectId">Value is an ObjectId</label>
          </div>
        </div>
        <div class="col-auto ms-md-auto d-flex gap-2">
          <button v-if="dataFilterActive" type="button" class="btn btn-sm btn-outline-secondary" @click="clearData">Remove</button>
          <button type="submit" class="btn btn-sm btn-primary" :disabled="!property.trim() || !value.trim()">Apply</button>
        </div>
        <div class="col-12 form-text mt-0">
          Matches a field of the job document: use the full path, e.g. <code>data.customerId</code>. Text matches anywhere, case-insensitively.
        </div>
      </form>
    </div>
  </div>
</template>
