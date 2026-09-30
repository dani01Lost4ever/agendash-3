<script setup lang="ts">
import { computed } from 'vue';

import type { JobEntry, SortDirection, SortField } from '../api';
import { ACTIONS, jobCount, type JobAction } from '../actions';
import { PAGE_SIZES } from '../filters';
import { formatDate, fromNow, isDisabled, mainState, STATE_META, statusText, statusTone } from '../jobs';
import AppIcon from './AppIcon.vue';
import StateBadge from './StateBadge.vue';

const props = defineProps<{
  jobs: JobEntry[];
  /** First load still in flight. */
  loading: boolean;
  selected: string[];
  sortBy: SortField | '';
  sortDir: SortDirection;
  page: number;
  pageSize: number;
  totalJobs: number;
  totalPages: number;
  filtered: boolean;
}>();

const emit = defineEmits<{
  'update:selected': [ids: string[]];
  sort: [field: SortField | '', direction: SortDirection];
  page: [page: number];
  'page-size': [size: number];
  open: [job: JobEntry];
  action: [action: JobAction, jobs: JobEntry[]];
  'clear-filters': [];
}>();

const COLUMNS: Array<{ field: SortField; label: string }> = [
  { field: 'nextRunAt', label: 'Next run' },
  { field: 'lastRunAt', label: 'Last run' },
  { field: 'lastFinishedAt', label: 'Finished' },
];

const SORT_OPTIONS = [
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'name:desc', label: 'Name Z–A' },
  { value: 'nextRunAt:desc', label: 'Next run, latest first' },
  { value: 'nextRunAt:asc', label: 'Next run, earliest first' },
  { value: 'lastRunAt:desc', label: 'Last run, latest first' },
  { value: 'lastRunAt:asc', label: 'Last run, oldest first' },
  { value: 'lastFinishedAt:desc', label: 'Finished, latest first' },
  { value: 'lastFinishedAt:asc', label: 'Finished, oldest first' },
];

const selectedJobs = computed(() => props.jobs.filter((job) => props.selected.includes(job.job._id)));
const allSelected = computed(() => props.jobs.length > 0 && selectedJobs.value.length === props.jobs.length);
const someSelected = computed(() => selectedJobs.value.length > 0 && !allSelected.value);
const anyDisabledSelected = computed(() => selectedJobs.value.some(isDisabled));
const anyEnabledSelected = computed(() => selectedJobs.value.some((job) => !isDisabled(job)));

const firstIndex = computed(() => (props.totalJobs === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const lastIndex = computed(() => Math.min(props.page * props.pageSize, props.totalJobs));

function isSelected(job: JobEntry) {
  return props.selected.includes(job.job._id);
}

function toggle(job: JobEntry) {
  const id = job.job._id;
  emit('update:selected', isSelected(job) ? props.selected.filter((item) => item !== id) : [...props.selected, id]);
}

function toggleAll() {
  emit('update:selected', allSelected.value ? [] : props.jobs.map((job) => job.job._id));
}

// Dates start from the most recent, names from A; a third click restores the default order
function toggleSort(field: SortField) {
  const initial: SortDirection = field === 'name' ? 'asc' : 'desc';
  if (props.sortBy !== field) {
    emit('sort', field, initial);
  } else if (props.sortDir === initial) {
    emit('sort', field, initial === 'asc' ? 'desc' : 'asc');
  } else {
    emit('sort', '', 'desc');
  }
}

function ariaSort(field: SortField) {
  if (props.sortBy !== field) return 'none';
  return props.sortDir === 'asc' ? 'ascending' : 'descending';
}

function sortIcon(field: SortField) {
  if (props.sortBy !== field) return 'unfold_more';
  return props.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
}

function stateIcon(job: JobEntry) {
  const state = mainState(job);
  return state ? STATE_META[state].icon : 'help';
}

// The sort menu shown instead of the column headers on narrow screens
const sortValue = computed({
  get: () => (props.sortBy ? `${props.sortBy}:${props.sortDir}` : ''),
  set: (value: string) => {
    const [field = '', direction = 'desc'] = value.split(':');
    emit('sort', field as SortField | '', direction as SortDirection);
  },
});

function bulk(action: JobAction) {
  emit('action', action, selectedJobs.value);
}
</script>

<template>
  <div class="card job-list">
    <!-- Bulk actions replace the header while jobs are selected -->
    <div v-if="selectedJobs.length" class="job-list-toolbar bulk agendash-write">
      <span class="fw-medium">{{ jobCount(selectedJobs.length) }} selected</span>
      <div class="d-flex flex-wrap gap-1 ms-auto">
        <button type="button" class="btn btn-sm btn-outline-success" @click="bulk('run')"><AppIcon :name="ACTIONS.run.icon" /> Run now</button>
        <button type="button" class="btn btn-sm btn-outline-primary" @click="bulk('requeue')"><AppIcon :name="ACTIONS.requeue.icon" /> Requeue</button>
        <button v-if="anyEnabledSelected" type="button" class="btn btn-sm btn-outline-secondary" @click="bulk('disable')"><AppIcon :name="ACTIONS.disable.icon" /> Disable</button>
        <button v-if="anyDisabledSelected" type="button" class="btn btn-sm btn-outline-secondary" @click="bulk('enable')"><AppIcon :name="ACTIONS.enable.icon" /> Enable</button>
        <button type="button" class="btn btn-sm btn-outline-danger" @click="bulk('delete')"><AppIcon :name="ACTIONS.delete.icon" /> Delete</button>
        <button type="button" class="btn btn-sm btn-link text-decoration-none" @click="emit('update:selected', [])">Clear</button>
      </div>
    </div>
    <div v-else class="job-list-toolbar">
      <span class="text-body-secondary small">
        <template v-if="totalJobs">Showing {{ firstIndex }}–{{ lastIndex }} of {{ totalJobs }}</template>
        <template v-else-if="!loading">No jobs</template>
      </span>
      <div class="d-flex align-items-center gap-2 ms-auto">
        <label class="small text-body-secondary d-none d-sm-inline d-xl-none" for="sortSelect">Sort by</label>
        <select id="sortSelect" v-model="sortValue" class="form-select form-select-sm w-auto d-xl-none">
          <option value="">Default</option>
          <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading && jobs.length === 0" class="job-list-empty">
      <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading</span></div>
    </div>
    <div v-else-if="jobs.length === 0" class="job-list-empty">
      <AppIcon name="inbox" class="job-list-empty-icon" />
      <p class="mb-2">{{ filtered ? 'No jobs match these filters.' : 'No jobs yet.' }}</p>
      <button v-if="filtered" type="button" class="btn btn-sm btn-outline-secondary" @click="emit('clear-filters')">Clear filters</button>
    </div>

    <template v-else>
      <!-- Table on wide screens -->
      <div class="table-responsive d-none d-xl-block">
        <table class="table table-hover align-middle mb-0 job-table">
          <thead>
            <tr>
              <th scope="col" class="col-check agendash-write">
                <input
                  type="checkbox"
                  class="form-check-input"
                  aria-label="Select all jobs on this page"
                  :checked="allSelected"
                  :indeterminate="someSelected"
                  @change="toggleAll"
                />
              </th>
              <th scope="col" :aria-sort="ariaSort('name')">
                <button type="button" class="sort-button" @click="toggleSort('name')">Name <AppIcon :name="sortIcon('name')" /></button>
              </th>
              <th scope="col">State</th>
              <th v-for="column in COLUMNS" :key="column.field" scope="col" :aria-sort="ariaSort(column.field)">
                <button type="button" class="sort-button" @click="toggleSort(column.field)">{{ column.label }} <AppIcon :name="sortIcon(column.field)" /></button>
              </th>
              <th scope="col" class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="job in jobs"
              :key="job.job._id"
              :class="{ 'table-active': isSelected(job), 'job-disabled': isDisabled(job) }"
              @click="emit('open', job)"
            >
              <td class="col-check agendash-write" @click.stop>
                <input type="checkbox" class="form-check-input" :aria-label="`Select ${job.job.name}`" :checked="isSelected(job)" @change="toggle(job)" />
              </td>
              <td class="job-name-cell">
                <div class="job-name">{{ job.job.name }}</div>
                <div v-if="job.job.repeatInterval" class="job-meta"><AppIcon name="repeat" /> {{ job.job.repeatInterval }}</div>
              </td>
              <td>
                <div class="d-flex flex-wrap gap-1">
                  <StateBadge :tone="statusTone(job)" :label="statusText(job)" :icon="stateIcon(job)" />
                  <StateBadge v-if="isDisabled(job)" tone="secondary" label="Disabled" icon="pause_circle" />
                </div>
              </td>
              <td :title="formatDate(job.job.nextRunAt)">{{ fromNow(job.job.nextRunAt) }}</td>
              <td :title="formatDate(job.job.lastRunAt)">{{ fromNow(job.job.lastRunAt) }}</td>
              <td :title="formatDate(job.job.lastFinishedAt)">{{ fromNow(job.job.lastFinishedAt) }}</td>
              <td class="text-end text-nowrap" @click.stop>
                <button type="button" class="btn btn-icon btn-sm agendash-write" :title="ACTIONS.run.label" :aria-label="`${ACTIONS.run.label}: ${job.job.name}`" :disabled="isDisabled(job) || job.running" @click="emit('action', 'run', [job])">
                  <AppIcon :name="ACTIONS.run.icon" />
                </button>
                <button
                  type="button"
                  class="btn btn-icon btn-sm agendash-write"
                  :title="isDisabled(job) ? ACTIONS.enable.label : ACTIONS.disable.label"
                  :aria-label="`${isDisabled(job) ? ACTIONS.enable.label : ACTIONS.disable.label}: ${job.job.name}`"
                  @click="emit('action', isDisabled(job) ? 'enable' : 'disable', [job])"
                >
                  <AppIcon :name="isDisabled(job) ? ACTIONS.enable.icon : ACTIONS.disable.icon" />
                </button>
                <button type="button" class="btn btn-icon btn-sm agendash-write" :title="ACTIONS.requeue.label" :aria-label="`${ACTIONS.requeue.label}: ${job.job.name}`" @click="emit('action', 'requeue', [job])">
                  <AppIcon :name="ACTIONS.requeue.icon" />
                </button>
                <button type="button" class="btn btn-icon btn-sm btn-icon-danger agendash-write" :title="ACTIONS.delete.label" :aria-label="`${ACTIONS.delete.label}: ${job.job.name}`" @click="emit('action', 'delete', [job])">
                  <AppIcon :name="ACTIONS.delete.icon" />
                </button>
                <button type="button" class="btn btn-icon btn-sm" title="Details and logs" :aria-label="`Details: ${job.job.name}`" @click="emit('open', job)">
                  <AppIcon name="chevron_right" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Cards on narrow screens -->
      <ul class="list-unstyled mb-0 d-xl-none job-cards">
        <li v-for="job in jobs" :key="job.job._id" :class="['job-card', { selected: isSelected(job), 'job-disabled': isDisabled(job) }]">
          <input
            type="checkbox"
            class="form-check-input mt-1 agendash-write"
            :aria-label="`Select ${job.job.name}`"
            :checked="isSelected(job)"
            @change="toggle(job)"
          />
          <button type="button" class="job-card-body" @click="emit('open', job)">
            <span class="d-flex align-items-start justify-content-between gap-2">
              <span class="job-name">{{ job.job.name }}</span>
              <StateBadge :tone="statusTone(job)" :label="statusText(job)" :icon="stateIcon(job)" />
            </span>
            <span v-if="job.job.repeatInterval || isDisabled(job)" class="job-meta">
              <template v-if="job.job.repeatInterval"><AppIcon name="repeat" /> {{ job.job.repeatInterval }}</template>
              <template v-if="isDisabled(job)"><AppIcon name="pause_circle" /> Disabled</template>
            </span>
            <span class="job-card-times">
              <span><span class="text-body-secondary">Next</span> {{ fromNow(job.job.nextRunAt) }}</span>
              <span><span class="text-body-secondary">Last</span> {{ fromNow(job.job.lastRunAt) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </template>

    <div v-if="totalJobs > 0" class="job-list-footer">
      <div class="d-flex align-items-center gap-2">
        <label class="small text-body-secondary" for="pageSize">Per page</label>
        <select id="pageSize" class="form-select form-select-sm w-auto" :value="pageSize" @change="emit('page-size', Number(($event.target as HTMLSelectElement).value))">
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
          <option v-if="!PAGE_SIZES.includes(pageSize)" :value="pageSize">{{ pageSize }}</option>
        </select>
      </div>
      <nav v-if="totalPages > 1" aria-label="Pages" class="d-flex align-items-center gap-1">
        <button type="button" class="btn btn-icon btn-sm" :disabled="page <= 1" aria-label="First page" @click="emit('page', 1)"><AppIcon name="first_page" /></button>
        <button type="button" class="btn btn-icon btn-sm" :disabled="page <= 1" aria-label="Previous page" @click="emit('page', page - 1)"><AppIcon name="chevron_left" /></button>
        <span class="small px-2">Page {{ page }} of {{ totalPages }}</span>
        <button type="button" class="btn btn-icon btn-sm" :disabled="page >= totalPages" aria-label="Next page" @click="emit('page', page + 1)"><AppIcon name="chevron_right" /></button>
        <button type="button" class="btn btn-icon btn-sm" :disabled="page >= totalPages" aria-label="Last page" @click="emit('page', totalPages)"><AppIcon name="last_page" /></button>
      </nav>
    </div>
  </div>
</template>
