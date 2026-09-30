<script setup lang="ts">
import { ref } from 'vue';

import { api, errorMessage } from '../api';
import { useModal } from '../composables/useModal';
import JsonEditor from './JsonEditor.vue';

const emit = defineEmits<{
  'popup-message': [message: string, kind: 'success' | 'danger'];
  'refresh-data': [];
}>();

const DEFAULT_JOB_DATA = `{
  "exampleKey": "exampleValue"
}`;

const jobDataParseError = ref('');
const jobName = ref('');
const jobSchedule = ref(''); // e.g. "in 5 minutes", "tomorrow at noon"
const jobRepeatEvery = ref(''); // e.g. "1 day", "2 hours"
const jobData = ref(DEFAULT_JOB_DATA);
const isCreating = ref(false);

const { element, show, hide } = useModal({
  // Let the closing animation finish before the form empties
  onHidden: () => setTimeout(clear, 200),
});

function clear() {
  jobDataParseError.value = '';
  jobName.value = '';
  jobSchedule.value = '';
  jobRepeatEvery.value = '';
  jobData.value = DEFAULT_JOB_DATA;
  isCreating.value = false;
}

/** Returns the parsed data, or null when it is not a JSON object. */
function validateAndParseData(): Record<string, unknown> | null {
  jobDataParseError.value = '';
  if (!jobData.value || jobData.value.trim() === '') {
    return {};
  }
  try {
    const parsedData: unknown = JSON.parse(jobData.value);
    if (typeof parsedData !== 'object' || parsedData === null || Array.isArray(parsedData)) {
      throw new Error('Job data must be a JSON object (e.g., {}).');
    }
    return parsedData as Record<string, unknown>;
  } catch (error) {
    jobDataParseError.value = `Invalid JSON: ${errorMessage(error, 'unknown error')}`;
    return null;
  }
}

async function create() {
  if (!jobName.value.trim()) {
    alert('Job Name is required.');
    return;
  }
  if (!jobSchedule.value.trim() && !jobRepeatEvery.value.trim()) {
    alert('Either Job Schedule (for one-time) or Job Repeat Every (for repeating) must be provided.');
    return;
  }
  if (jobSchedule.value.trim() && jobRepeatEvery.value.trim()) {
    alert('Provide either Job Schedule OR Job Repeat Every, not both.');
    return;
  }

  const parsedJobData = validateAndParseData();
  if (parsedJobData === null) {
    return;
  }

  isCreating.value = true;
  try {
    await api.createJob({
      jobName: jobName.value.trim(),
      jobSchedule: jobSchedule.value.trim(),
      jobRepeatEvery: jobRepeatEvery.value.trim(),
      jobData: parsedJobData,
    });
    emit('popup-message', 'Job created successfully!', 'success');
    emit('refresh-data');
    hide();
    clear();
  } catch (error) {
    console.error('Error creating job:', error);
    emit('popup-message', `Error: ${errorMessage(error, 'Failed to create job.')}`, 'danger');
  } finally {
    isCreating.value = false;
  }
}

defineExpose({ open: show });
</script>

<template>
  <div ref="element" class="modal fade" tabindex="-1" aria-labelledby="newJobModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
      <div class="modal-content shadow-lg">
        <div class="modal-header bg-light border-bottom">
          <h5 id="newJobModalLabel" class="modal-title">Create New Job</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form @submit.prevent="create">
            <div class="mb-3">
              <label for="jobNameInput" class="form-label">Job Name <span class="text-danger">*</span></label>
              <input id="jobNameInput" v-model.trim="jobName" type="text" class="form-control" placeholder="e.g., Send Welcome Email" required>
            </div>

            <p class="text-muted small mb-2">Define when the job runs (provide only one):</p>
            <div class="row">
              <div class="col-md-6">
                <div class="mb-3">
                  <label for="jobScheduleInput" class="form-label">Run Once At (Schedule)</label>
                  <input id="jobScheduleInput" v-model.trim="jobSchedule" type="text" class="form-control" placeholder="e.g., in 5 minutes, tomorrow at 9am">
                  <small class="form-text text-muted">Uses <a href="https://github.com/MatthewMueller/date" target="_blank" rel="noopener">date.js</a> (e.g., "tomorrow at noon", "in 1 hour"). Leave blank if repeating.</small>
                </div>
              </div>
              <div class="col-md-6">
                <div class="mb-3">
                  <label for="jobRepeatInput" class="form-label">Repeat Every</label>
                  <input id="jobRepeatInput" v-model.trim="jobRepeatEvery" type="text" class="form-control" placeholder="e.g., 1 day, 2 hours">
                  <small class="form-text text-muted">Uses <a href="https://github.com/jkroso/human-interval" target="_blank" rel="noopener">human-interval</a> (e.g., "3 hours", "1 week"). Leave blank if running once.</small>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Job Data (Metadata - JSON Object)</label>
              <JsonEditor v-model="jobData" class="json-editor json-editor-input border rounded" :class="{ 'is-invalid': jobDataParseError }" />
              <div v-if="jobDataParseError" class="invalid-feedback d-block">
                {{ jobDataParseError }}
              </div>
              <small v-else class="form-text text-muted">Enter job-specific data as a valid JSON object {}.</small>
            </div>
            <!-- Lets Enter submit the form -->
            <button type="submit" class="d-none"></button>
          </form>
        </div>
        <div class="modal-footer bg-light border-top">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="isCreating" @click="create()">
            <span v-if="isCreating" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <i v-else class="material-icons md-18 align-middle me-1">save</i>
            {{ isCreating ? 'Creating...' : 'Create Job' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
