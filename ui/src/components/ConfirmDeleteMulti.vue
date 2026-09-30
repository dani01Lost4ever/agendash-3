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
const isDeleting = ref(false);

async function deleteMulti() {
  const ids = props.jobs;
  if (ids.length === 0) {
    console.error('Delete Multi Error: No Job IDs provided.');
    emit('popup-message', 'Error: No jobs selected for deletion.', 'danger');
    return;
  }

  isDeleting.value = true;
  try {
    await api.deleteJobs(ids);
    emit('popup-message', `${ids.length} job(s) deleted successfully!`, 'success');
    emit('refresh-data');
    modal.value?.hide();
  } catch (error) {
    console.error('Error deleting multiple jobs:', error);
    emit('popup-message', `Error: ${errorMessage(error, 'Failed to delete jobs.')}`, 'danger');
  } finally {
    isDeleting.value = false;
  }
}

defineExpose({ open: () => modal.value?.open() });
</script>

<template>
  <ConfirmModal
    ref="modal"
    title="Confirm Bulk Deletion"
    title-icon="warning"
    tone="danger"
    :confirm-label="`Delete Selected (${jobs.length})`"
    confirm-icon="delete_sweep"
    busy-label="Deleting..."
    :busy="isDeleting"
    :disabled="jobs.length === 0"
    @confirm="deleteMulti"
  >
    <div v-if="jobs.length > 0">
      <p class="lead">Are you absolutely sure you want to permanently delete the selected <strong>{{ jobs.length }}</strong> job(s)?</p>
      <p class="text-danger mt-3"><strong>This action cannot be undone.</strong></p>
    </div>
    <div v-else class="text-center text-muted py-3">
      No jobs selected for deletion.
    </div>
  </ConfirmModal>
</template>
