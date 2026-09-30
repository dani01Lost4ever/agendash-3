<script setup lang="ts">
import { ref } from 'vue';

import { api, type TaskLog } from '../api';

const props = defineProps<{ jobId: string }>();

const logs = ref<TaskLog[]>([]);
const loading = ref(false);

async function fetchLogs() {
  loading.value = true;
  try {
    logs.value = await api.getTaskLogs(props.jobId);
  } finally {
    loading.value = false;
  }
}

fetchLogs().catch((error: unknown) => console.error('Error fetching task logs:', error));
</script>

<template>
  <div class="task-logs p-3">
    <h5>Task Execution Log</h5>
    <div v-if="loading" class="text-center">
      <div class="spinner-border" role="status">
        <span class="visually-hidden"></span>
      </div>
    </div>
    <div v-else class="log-list">
      <div
        v-for="log in logs"
        :key="log._id"
        :class="['log-entry p-2 mb-2 rounded', {
          'bg-success text-white': log.status === 'completed',
          'bg-danger text-white': log.status === 'failed',
          'bg-info text-white': log.status === 'started'
        }]"
      >
        <div class="d-flex justify-content-between">
          <strong>{{ log.status.toUpperCase() }}</strong>
          <small>{{ new Date(log.timestamp).toLocaleString() }}</small>
        </div>
        <div>{{ log.message }}</div>
      </div>
    </div>
  </div>
</template>
