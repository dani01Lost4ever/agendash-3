<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { api, errorMessage, type TaskLog } from '../api';
import { formatDate, formatDuration, fromNow, timestamp } from '../jobs';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  jobId: string;
  /** Changes when the dashboard refreshes, to reload the log. */
  refreshKey?: number | null;
}>();

const logs = ref<TaskLog[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref('');

async function fetchLogs() {
  loading.value = true;
  try {
    logs.value = await api.getTaskLogs(props.jobId);
    error.value = '';
  } catch (caught) {
    error.value = errorMessage(caught, 'Could not load the execution log.');
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

watch(() => props.jobId, () => {
  logs.value = [];
  loaded.value = false;
  void fetchLogs();
}, { immediate: true });
watch(() => props.refreshKey, () => void fetchLogs());

const STATUS = {
  started: { icon: 'play_circle', tone: 'info', label: 'Started' },
  completed: { icon: 'check_circle', tone: 'success', label: 'Completed' },
  failed: { icon: 'error', tone: 'danger', label: 'Failed' },
} as const;

// Logs come newest first: a run's "started" entry follows its "completed" or "failed" one
const entries = computed(() =>
  logs.value.map((log, index) => {
    let duration: string | undefined;
    if (log.status !== 'started') {
      const start = logs.value.slice(index + 1).find((entry) => entry.status === 'started');
      if (start) duration = formatDuration(timestamp(log.timestamp) - timestamp(start.timestamp));
    }
    return { log, duration, meta: STATUS[log.status] ?? STATUS.started };
  }),
);
</script>

<template>
  <div class="task-logs">
    <div class="d-flex align-items-center justify-content-between mb-3">
      <span class="small text-body-secondary">Latest 100 events, newest first</span>
      <button type="button" class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" :disabled="loading" @click="fetchLogs">
        <AppIcon name="refresh" :class="{ 'app-spin': loading }" /> Refresh
      </button>
    </div>

    <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
    <div v-if="!loaded" class="text-center py-4">
      <div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading</span></div>
    </div>
    <div v-else-if="entries.length === 0 && !error" class="text-center text-body-secondary py-4">
      <AppIcon name="history" class="d-block mx-auto mb-2 fs-2" />
      No executions logged for this job yet.
    </div>
    <ol v-else class="log-timeline">
      <li v-for="{ log, duration, meta } in entries" :key="log._id" :class="['log-entry', `log-entry-${meta.tone}`]">
        <span class="log-dot"><AppIcon :name="meta.icon" /></span>
        <div class="log-content">
          <div class="d-flex flex-wrap align-items-baseline gap-2">
            <strong>{{ meta.label }}</strong>
            <span v-if="duration" class="log-duration" title="Duration">{{ duration }}</span>
            <span class="small text-body-secondary ms-auto" :title="formatDate(log.timestamp)">{{ fromNow(log.timestamp) }}</span>
          </div>
          <div v-if="log.status === 'failed'" class="log-message text-danger-emphasis">{{ log.message }}</div>
          <div class="small text-body-secondary">{{ formatDate(log.timestamp) }}</div>
        </div>
      </li>
    </ol>
  </div>
</template>
