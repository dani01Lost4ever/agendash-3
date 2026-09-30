<script setup lang="ts">
import { computed } from 'vue';

import type { OverviewEntry } from '../api';

const props = defineProps<{
  overview: OverviewEntry[];
  pagesize: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  'search-sidebar': [
    name: string,
    search: string,
    property: string,
    limit: number,
    skip: string,
    refresh: string,
    state: string,
    object: string,
  ];
  'new-job': [];
}>();

const sortedArray = computed(() => {
  const compare = (a: OverviewEntry, b: OverviewEntry) => {
    const displayNameA = a.displayName.toLowerCase();
    const displayNameB = b.displayName.toLowerCase();
    if (displayNameA < displayNameB) return -1;
    if (displayNameA > displayNameB) return 1;
    return 0;
  };
  // "All Jobs" first, the rest by name
  const allJobs = props.overview.find((item) => item.displayName === 'All Jobs');
  const otherJobs = props.overview.filter((item) => item.displayName !== 'All Jobs').sort(compare);
  return allJobs ? [allJobs, ...otherJobs] : otherJobs;
});

// Bar segments grow with the log of their count so small states stay visible
function flexgrow(count: number) {
  return Math.log2(1 + count);
}

function searchSpecificJob(job: string, type: string) {
  const jobName = job === 'All Jobs' ? '' : job;
  emit('search-sidebar', jobName, '', '', props.pagesize, '', '', type, '');

  const url = new URL(window.location.href);
  if (type) {
    url.searchParams.set('jobType', type);
  } else {
    url.searchParams.delete('jobType');
  }
  if (jobName) {
    url.searchParams.set('name', jobName);
  } else {
    url.searchParams.delete('name');
  }
  window.history.replaceState({}, '', url);
}
</script>

<template>
  <div class="col sidebar pt-3 pb-3 border-end bg-light">
    <div class="row mb-3 px-2">
      <div class="col">
        <button title="Add a new job" class="btn w-100 btn-success shadow-sm agendash-write" @click="emit('new-job')">New Job</button>
      </div>
    </div>
    <div class="row p-0">
      <div v-if="loading" class="col-12 my-5 text-center">
        <div class="text-center my-5 py-5">
          <div class="spinner-border text-primary" role="status"></div>
          <div class="mt-2 text-muted">Loading Jobs...</div>
        </div>
      </div>
      <div v-else class="col">
        <div v-for="type in sortedArray" :key="type.displayName" class="mb-4">
          <div class="d-flex align-items-center p-2 rounded clickable-row job-type-header" @click="searchSpecificJob(type.displayName, '')">
            <div class="me-auto fw-bold">{{ type.displayName }}</div>
            <div class="badge text-bg-secondary rounded-pill px-2">{{ type.total }}</div>
          </div>
          <div class="col-12 p-1 mt-1 mb-2">
            <div class="progress sidebar-progress">
              <div class="progress-bar bg-info" role="progressbar" :style="{ 'flex-grow': flexgrow(type.scheduled) }" title="Scheduled"></div>
              <div class="progress-bar bg-primary" role="progressbar" :style="{ 'flex-grow': flexgrow(type.queued) }" title="Queued"></div>
              <div class="progress-bar bg-warning" role="progressbar" :style="{ 'flex-grow': flexgrow(type.running) }" title="Running"></div>
              <div class="progress-bar bg-success" role="progressbar" :style="{ 'flex-grow': flexgrow(type.completed) }" title="Completed"></div>
              <div class="progress-bar bg-danger" role="progressbar" :style="{ 'flex-grow': flexgrow(type.failed) }" title="Failed"></div>
              <!-- Repeating overlaps the other states, so it has no segment -->
            </div>
          </div>
          <div class="list-group list-group-flush small">
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName, 'scheduled')">
              <div><span class="status-dot bg-info"></span> Scheduled</div>
              <span class="badge text-bg-info rounded-pill">{{ type.scheduled }}</span>
            </div>
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName, 'queued')">
              <div><span class="status-dot bg-primary"></span> Queued</div>
              <span class="badge text-bg-primary rounded-pill">{{ type.queued }}</span>
            </div>
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName, 'running')">
              <div><span class="status-dot bg-warning"></span> Running</div>
              <span class="badge text-bg-warning rounded-pill">{{ type.running }}</span>
            </div>
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName, 'completed')">
              <div><span class="status-dot bg-success"></span> Completed</div>
              <span class="badge text-bg-success rounded-pill">{{ type.completed }}</span>
            </div>
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName, 'failed')">
              <div><span class="status-dot bg-danger"></span> Failed</div>
              <span class="badge text-bg-danger rounded-pill">{{ type.failed }}</span>
            </div>
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName, 'repeating')">
              <div><span class="status-dot bg-secondary"></span> Repeating</div>
              <span class="badge text-bg-secondary rounded-pill">{{ type.repeating }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
