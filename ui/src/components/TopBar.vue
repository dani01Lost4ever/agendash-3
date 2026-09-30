<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  name: string;
  state: string;
  search: string;
  property: string;
}>();

const emit = defineEmits<{
  'search-form': [
    name: string,
    search: string,
    property: string,
    limit: number | string,
    skip: number,
    refresh: number | string,
    state: string,
    object: boolean,
  ];
}>();

const url = new URL(window.location.href);

const limit = ref<number | string>(url.searchParams.get('limit') ?? 50);
const refresh = ref<number | string>(url.searchParams.get('refresh') ?? 0);
const object = ref(false);
const stateobject = [
  { text: 'All Statuses', value: '', class: '' },
  { text: 'Scheduled', value: 'scheduled', class: 'text-info' },
  { text: 'Queued', value: 'queued', class: 'text-primary' },
  { text: 'Running', value: 'running', class: 'text-warning' },
  { text: 'Completed', value: 'completed', class: 'text-success' },
  { text: 'Failed', value: 'failed', class: 'text-danger' },
  { text: 'Repeating', value: 'repeating', class: 'text-info' },
];

// Local copies so the form never mutates its props
const localName = ref(props.name);
const localState = ref(props.state);
const localSearch = ref(props.search);
const localProperty = ref(props.property);

// Follow changes made elsewhere, e.g. a click in the sidebar
watch(() => props.name, (value) => (localName.value = value));
watch(() => props.state, (value) => (localState.value = value));
watch(() => props.search, (value) => (localSearch.value = value));
watch(() => props.property, (value) => (localProperty.value = value));

function submit() {
  emit(
    'search-form',
    localName.value,
    localSearch.value,
    localProperty.value,
    limit.value,
    0, // pagination restarts from the first page
    refresh.value,
    localState.value,
    object.value,
  );
}

function clearSearch() {
  localName.value = '';
  localState.value = '';
  localSearch.value = '';
  localProperty.value = '';
  object.value = false;
  submit();
}
</script>

<template>
  <div class="card shadow-sm mb-4">
    <div class="card-body p-3">
      <form @submit.prevent="submit">
        <div class="row">
          <div class="col-lg-6 col-md-12 mb-3 mb-lg-0">
            <h6 class="text-muted mb-2">Filter Jobs</h6>
            <div class="input-group input-group-sm mb-2">
              <span class="input-group-text topbar-label"> Name </span>
              <input v-model.trim="localName" type="text" class="form-control" placeholder="Job name (exact match or /regex/)" />
            </div>
            <div class="input-group input-group-sm mb-2">
              <span class="input-group-text topbar-label"> Status </span>
              <select v-model="localState" class="form-select form-select-sm">
                <option v-for="option in stateobject" :key="option.value" :value="option.value" :class="option.class">{{ option.text }}</option>
              </select>
            </div>
          </div>

          <div class="col-lg-6 col-md-12">
            <h6 class="text-muted mb-2">Filter by Data</h6>
            <div class="input-group input-group-sm mb-2">
              <span class="input-group-text topbar-label"> Property </span>
              <input v-model.trim="localProperty" type="text" class="form-control" placeholder="e.g., user.id or tags" />
            </div>
            <div class="input-group input-group-sm mb-2">
              <span class="input-group-text topbar-label"> Value </span>
              <input v-model.trim="localSearch" class="form-control" placeholder="e.g., 123 or /pattern/i" />
              <div class="input-group-text">
                <div class="form-check form-check-inline m-0 topbar-check">
                  <input id="isObjectId" v-model="object" type="checkbox" class="form-check-input">
                  <label class="form-check-label" for="isObjectId"> Is ObjectId?</label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <hr class="my-2">
        <div class="row align-items-center">
          <div class="col-lg-6 col-md-12 mb-2 mb-lg-0">
            <div class="row g-2">
              <div class="col-auto">
                <div class="input-group input-group-sm">
                  <span class="input-group-text"> Page Size </span>
                  <input v-model.number="limit" type="number" min="5" max="500" step="5" class="form-control topbar-number" />
                </div>
              </div>
              <div class="col-auto">
                <div class="input-group input-group-sm">
                  <span class="input-group-text"> Auto-Refresh (sec) </span>
                  <input v-model.number="refresh" type="number" min="0" max="300" step="5" class="form-control topbar-number" placeholder="0 = off" />
                </div>
              </div>
            </div>
          </div>
          <div class="col-lg-6 col-md-12 text-end">
            <button type="button" class="btn btn-sm btn-outline-secondary me-2" @click="clearSearch">
              <i class="material-icons md-18 align-middle me-1">clear_all</i> Clear Filters
            </button>
            <button type="submit" class="btn btn-sm btn-primary">
              <i class="material-icons md-18 align-middle me-1">search</i> Apply Filters
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>
