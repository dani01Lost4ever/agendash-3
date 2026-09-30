<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { JobDocument, JobEntry } from '../api';
import { formatDate, fromNow, statusClass, statusText, timestamp } from '../jobs';

const props = defineProps<{
  jobs: JobEntry[];
  pagesize: number;
  pagenumber: number;
  totalPages: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  'confirm-delete': [job: JobEntry];
  'confirm-multi-delete': [jobIds: string[]];
  'confirm-requeue': [job: JobEntry];
  'confirm-multi-requeue': [jobIds: string[]];
  'show-job-detail': [job: JobEntry];
  pagechange: [action: 'next' | 'prev'];
}>();

type SortField = 'status' | 'name' | 'lastRunAt' | 'nextRunAt' | 'lastFinishedAt';

const multijobs = ref<string[]>([]);
const currentSort = ref<SortField>('name');
const currentSortDir = ref<'asc' | 'desc'>('asc');

const sortedJobs = computed(() =>
  [...props.jobs].sort((a, b) => {
    const field = currentSort.value;
    const valA = a.job?.[field as keyof JobDocument];
    const valB = b.job?.[field as keyof JobDocument];

    let displayA: string | number;
    let displayB: string | number;
    if (field === 'name') {
      displayA = valA ? String(valA).toLowerCase() : '';
      displayB = valB ? String(valB).toLowerCase() : '';
    } else {
      // Dates; missing ones sort as the epoch
      displayA = timestamp(valA as string | null | undefined);
      displayB = timestamp(valB as string | null | undefined);
    }

    const modifier = currentSortDir.value === 'desc' ? -1 : 1;
    if (displayA < displayB) return -1 * modifier;
    if (displayA > displayB) return 1 * modifier;
    return 0;
  }),
);

watch(
  () => props.jobs,
  () => {
    multijobs.value = [];
  },
);

function sort(field: SortField) {
  if (field === currentSort.value) {
    currentSortDir.value = currentSortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.value = field;
    currentSortDir.value = 'asc';
  }
}

function sortIcon(field: SortField, ascIcon: string, descIcon: string) {
  if (currentSort.value !== field) return 'unfold_more';
  return currentSortDir.value === 'asc' ? ascIcon : descIcon;
}

function sendQueued() {
  emit('confirm-multi-requeue', multijobs.value);
}

function sendDelete() {
  emit('confirm-multi-delete', multijobs.value);
}

function formatTitle(date: string | null | undefined) {
  return formatDate(date, 'YYYY-MM-DD HH:mm:ss Z');
}

function checkAllCheckboxes() {
  // Toggles every row based on the first row: all selected, or none
  const ids = sortedJobs.value.map((job) => job.job._id);
  const shouldCheck = ids.length > 0 && !multijobs.value.includes(ids[0]);
  if (shouldCheck) {
    multijobs.value = [...multijobs.value, ...ids.filter((id) => !multijobs.value.includes(id))];
  } else {
    multijobs.value = multijobs.value.filter((id) => !ids.includes(id));
  }
}

function toggleList(job: JobEntry) {
  const jobId = job.job._id;
  const index = multijobs.value.indexOf(jobId);
  if (index > -1) {
    multijobs.value.splice(index, 1);
  } else {
    multijobs.value.push(jobId);
  }
}
</script>

<template>
  <div>
    <!-- Multi Action Bar -->
    <div class="d-flex justify-content-end align-items-center mb-3 p-2 bg-light border rounded shadow-sm">
      <span class="me-3 text-muted">{{ multijobs.length }} job(s) selected</span>
      <button :disabled="!multijobs.length" class="btn btn-sm btn-primary me-2 agendash-write" title="Requeue selected jobs" @click="sendQueued">
        <i class="material-icons md-18 align-middle me-1">update</i> Requeue Selected
      </button>
      <button :disabled="!multijobs.length" class="btn btn-sm btn-danger agendash-write" title="Delete selected jobs" @click="sendDelete">
        <i class="material-icons md-18 align-middle me-1">delete_sweep</i> Delete Selected
      </button>
    </div>

    <!-- Desktop Table View -->
    <table class="table table-hover table-striped d-none d-xl-table border rounded shadow-sm">
      <thead class="table-light">
        <tr>
          <th width="5%" class="text-center py-2"><input type="checkbox" title="Select/Deselect All" @click="checkAllCheckboxes()" /></th>
          <th width="10%" scope="col" class="py-2 clickable" @click="sort('status')"> Status </th>
          <th width="25%" scope="col" class="py-2 clickable" @click="sort('name')"> Name <i class="material-icons md-18 sortable">{{ sortIcon('name', 'arrow_drop_down', 'arrow_drop_up') }}</i></th>
          <th width="15%" scope="col" class="py-2 clickable" @click="sort('lastRunAt')"> Last run <i class="material-icons md-18 sortable">{{ sortIcon('lastRunAt', 'arrow_drop_up', 'arrow_drop_down') }}</i></th>
          <th width="15%" scope="col" class="py-2 clickable" @click="sort('nextRunAt')"> Next run <i class="material-icons md-18 sortable">{{ sortIcon('nextRunAt', 'arrow_drop_up', 'arrow_drop_down') }}</i></th>
          <th width="15%" scope="col" class="py-2 clickable" @click="sort('lastFinishedAt')"> Finished <i class="material-icons md-18 sortable">{{ sortIcon('lastFinishedAt', 'arrow_drop_up', 'arrow_drop_down') }}</i></th>
          <th width="15%" scope="col" class="text-center py-2"> Actions </th>
        </tr>
      </thead>
      <tbody v-if="loading">
        <tr>
          <td colspan="7" class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <div class="mt-2 text-muted">Loading Jobs...</div>
          </td>
        </tr>
      </tbody>
      <tbody v-else>
        <tr v-for="job in sortedJobs" :key="job.job._id" :class="{ 'table-active': multijobs.includes(job.job._id) }">
          <td class="text-center mult-select py-2 align-middle">
            <input :id="'check-' + job.job._id" v-model="multijobs" class="checkbox-triggerable" type="checkbox" :value="job.job._id" />
          </td>
          <td class="py-2 align-middle" @click="toggleList(job)">
            <span :class="['badge', statusClass(job), 'rounded-pill', 'px-2']">{{ statusText(job) }}</span>
          </td>
          <td class="job-name py-2 align-middle" @click="toggleList(job)"> {{ job.job.name }} </td>
          <td class="job-lastRunAt py-2 align-middle" :title="formatTitle(job.job.lastRunAt)" @click="toggleList(job)"> {{ fromNow(job.job.lastRunAt) }} </td>
          <td class="job-nextRunAt py-2 align-middle" :title="formatTitle(job.job.nextRunAt)" @click="toggleList(job)"> {{ fromNow(job.job.nextRunAt) }} </td>
          <td class="job-finishedAt py-2 align-middle" :title="formatTitle(job.job.lastFinishedAt)" @click="toggleList(job)"> {{ fromNow(job.job.lastFinishedAt) }} </td>
          <td class="job-actions text-center py-2 align-middle">
            <i class="material-icons md-dark md-custom action-btn mx-1 text-primary agendash-write" title="Requeue Job" @click.stop="emit('confirm-requeue', job)">update</i>
            <i class="material-icons md-dark md-custom action-btn mx-1 text-info" title="View Details & Logs" @click.stop="emit('show-job-detail', job)">visibility</i>
            <i class="material-icons md-dark md-custom action-btn mx-1 text-danger agendash-write" title="Delete Job" @click.stop="emit('confirm-delete', job)">delete_forever</i>
          </td>
        </tr>
        <tr v-if="!jobs || jobs.length === 0">
          <td colspan="7" class="text-center text-muted py-4">No jobs found matching your criteria.</td>
        </tr>
      </tbody>
    </table>

    <!-- Mobile/Tablet Card View -->
    <div class="d-xl-none">
      <div v-if="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <div class="mt-2 text-muted">Loading Jobs...</div>
      </div>
      <div v-else class="row">
        <div v-for="job in sortedJobs" :key="job.job._id" class="col-12 col-sm-6 col-md-6 col-lg-4 mb-3">
          <div class="card h-100 shadow-sm" :class="{ 'border-primary': multijobs.includes(job.job._id) }">
            <div class="card-header d-flex justify-content-between align-items-center py-2">
              <div class="form-check d-inline-flex align-items-center me-2 card-title-check">
                <input :id="'card-check-' + job.job._id" v-model="multijobs" type="checkbox" :value="job.job._id" class="form-check-input mt-0 me-2" @click.stop>
                <label :for="'card-check-' + job.job._id" class="form-check-label fw-bold text-truncate clickable mb-0" @click="toggleList(job)">
                  {{ job.job.name }}
                </label>
              </div>
              <div class="job-actions flex-shrink-0 ms-2">
                <i class="material-icons md-dark md-custom action-btn mx-1 text-primary agendash-write" title="Requeue" @click.stop="emit('confirm-requeue', job)">update</i>
                <i class="material-icons md-dark md-custom action-btn mx-1 text-info" title="Details & Logs" @click.stop="emit('show-job-detail', job)">visibility</i>
                <i class="material-icons md-dark md-custom action-btn mx-1 text-danger agendash-write" title="Delete" @click.stop="emit('confirm-delete', job)">delete_forever</i>
              </div>
            </div>
            <div class="card-body py-2 px-3 clickable" @click="toggleList(job)">
              <div class="text-center mb-2">
                <span :class="['badge', statusClass(job), 'rounded-pill', 'px-2', 'py-1']">{{ statusText(job) }}</span>
              </div>
              <div class="row small text-muted">
                <div class="col-6 mb-1"><strong>Last run:</strong></div>
                <div class="col-6 mb-1 text-end" :title="formatTitle(job.job.lastRunAt)">{{ fromNow(job.job.lastRunAt) }}</div>
                <div class="col-6 mb-1"><strong>Next run:</strong></div>
                <div class="col-6 mb-1 text-end" :title="formatTitle(job.job.nextRunAt)">{{ fromNow(job.job.nextRunAt) }}</div>
                <div class="col-6"><strong>Finished:</strong></div>
                <div class="col-6 text-end" :title="formatTitle(job.job.lastFinishedAt)">{{ fromNow(job.job.lastFinishedAt) }}</div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="!jobs || jobs.length === 0" class="col-12 text-center text-muted py-4">
          No jobs found matching your criteria.
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1 || pagenumber > 1" class="row mt-3">
      <div class="col d-flex flex-column flex-sm-row justify-content-center align-items-center">
        <nav aria-label="Page navigation" class="mb-2 mb-sm-0 me-sm-3">
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item" :class="{ disabled: pagenumber === 1 }">
              <a class="page-link" href="#" @click.prevent="emit('pagechange', 'prev')">Previous</a>
            </li>
            <li class="page-item" :class="{ disabled: pagenumber >= totalPages }">
              <a class="page-link" href="#" @click.prevent="emit('pagechange', 'next')">Next</a>
            </li>
          </ul>
        </nav>
        <span class="text-muted small">Page: {{ pagenumber }} / {{ totalPages }}</span>
      </div>
    </div>
  </div>
</template>
