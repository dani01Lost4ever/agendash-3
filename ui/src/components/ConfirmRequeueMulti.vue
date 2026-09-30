<script setup lang="ts">
import { ref } from 'vue';

import { api, errorMessage } from '../api';
import ConfirmModal from './ConfirmModal.vue';

const props = defineProps<{ jobs: string[] }>();

const emit = defineEmits<{
  'popup-message': [message: string, kind: 'success' | 'danger'];
  'refresh-data': [];
}>();

const modal = ref<InstanceType<typeof ConfirmModal> | null>(null);
const isRequeuing = ref(false);

async function requeueMulti() {
  const ids = props.jobs;
  if (ids.length === 0) {
    console.error('Requeue Multi Error: No Job IDs provided.');
    emit('popup-message', 'Error: No jobs selected for requeue.', 'danger');
    return;
  }

  isRequeuing.value = true;
  try {
    await api.requeueJobs(ids);
    emit('popup-message', `${ids.length} job(s) successfully requeued!`, 'success');
    emit('refresh-data');
    modal.value?.hide();
  } catch (error) {
    console.error('Error requeueing multiple jobs:', error);
    emit('popup-message', `Error: ${errorMessage(error, 'Failed to requeue jobs.')}`, 'danger');
  } finally {
    isRequeuing.value = false;
  }
}

defineExpose({ open: () => modal.value?.open() });
</script>

<template>
  <ConfirmModal
    ref="modal"
    title="Confirm Bulk Requeue"
    title-icon="update"
    tone="primary"
    :confirm-label="`Requeue Selected (${jobs.length})`"
    confirm-icon="update"
    busy-label="Requeuing..."
    :busy="isRequeuing"
    :disabled="jobs.length === 0"
    @confirm="requeueMulti"
  >
    <div v-if="jobs.length > 0">
      <p class="lead">Are you sure you want to requeue the selected <strong>{{ jobs.length }}</strong> job(s)?</p>
      <p class="small text-muted">This will create new instances for each selected job, ready to be run.</p>
    </div>
    <div v-else class="text-center text-muted py-3">
      No jobs selected for requeue.
    </div>
  </ConfirmModal>
</template>
