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
const isDeleting = ref(false);

async function deleteOne() {
  const id = props.job?.job?._id;
  if (!id) {
    console.error('Delete Error: Job ID is missing.');
    emit('popup-message', 'Error: Cannot delete job without ID.', 'danger');
    return;
  }

  isDeleting.value = true;
  try {
    await api.deleteJobs([id]);
    emit('popup-message', 'Job deleted successfully!', 'success');
    emit('refresh-data');
    modal.value?.hide();
  } catch (error) {
    console.error('Error deleting job:', error);
    emit('popup-message', `Error: ${errorMessage(error, 'Failed to delete job.')}`, 'danger');
  } finally {
    isDeleting.value = false;
  }
}

defineExpose({ open: () => modal.value?.open() });
</script>

<template>
  <ConfirmModal
    ref="modal"
    title="Confirm Permanent Deletion"
    title-icon="warning"
    tone="danger"
    confirm-label="Delete Permanently"
    confirm-icon="delete_forever"
    busy-label="Deleting..."
    :busy="isDeleting"
    :disabled="!job?.job?._id"
    @confirm="deleteOne"
  >
    <div v-if="job && job.job">
      <p class="lead">Are you absolutely sure you want to permanently delete this job?</p>
      <div class="alert alert-warning small p-2">
        <strong>Job Name:</strong> {{ job.job.name }}<br>
        <strong>ID:</strong> <code class="text-muted">{{ job.job._id }}</code>
      </div>
      <p class="text-danger"><strong>This action cannot be undone.</strong></p>
    </div>
    <div v-else class="text-center text-muted py-3">
      Loading job details...
    </div>
  </ConfirmModal>
</template>
