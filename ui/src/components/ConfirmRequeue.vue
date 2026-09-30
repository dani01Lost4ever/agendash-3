<script setup lang="ts">
import { ref } from 'vue';

import { api, errorMessage, type JobEntry } from '../api';
import ConfirmModal from './ConfirmModal.vue';

const props = defineProps<{ job: JobEntry | null }>();

const emit = defineEmits<{
  'popup-message': [message: string, kind: 'success' | 'danger'];
  'refresh-data': [];
}>();

const modal = ref<InstanceType<typeof ConfirmModal> | null>(null);
const isRequeuing = ref(false);

async function requeueOne() {
  const id = props.job?.job?._id;
  if (!id) {
    console.error('Requeue Error: Job ID is missing.');
    emit('popup-message', 'Error: Cannot requeue job without ID.', 'danger');
    return;
  }

  isRequeuing.value = true;
  try {
    await api.requeueJobs([id]);
    emit('popup-message', 'Job successfully requeued!', 'success');
    emit('refresh-data');
    modal.value?.hide();
  } catch (error) {
    console.error('Error requeueing job:', error);
    emit('popup-message', `Error: ${errorMessage(error, 'Failed to requeue job.')}`, 'danger');
  } finally {
    isRequeuing.value = false;
  }
}

defineExpose({ open: () => modal.value?.open() });
</script>

<template>
  <ConfirmModal
    ref="modal"
    title="Confirm Job Requeue"
    title-icon="update"
    tone="primary"
    confirm-label="Requeue Job"
    confirm-icon="update"
    busy-label="Requeuing..."
    :busy="isRequeuing"
    :disabled="!job?.job?._id"
    @confirm="requeueOne"
  >
    <div v-if="job && job.job">
      <p class="lead">Are you sure you want to requeue this job?</p>
      <p class="small text-muted">This will create a new instance of the job ready to be run, ignoring any existing schedule or repeat interval for the new instance.</p>
      <div class="alert alert-secondary small p-2 mt-3">
        <strong>Job Name:</strong> {{ job.job.name }}<br>
        <strong>ID:</strong> <code class="text-muted">{{ job.job._id }}</code>
      </div>
    </div>
    <div v-else class="text-center text-muted py-3">
      Loading job details...
    </div>
  </ConfirmModal>
</template>
