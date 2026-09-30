<script setup lang="ts">
import { computed, ref } from 'vue';

import { api, errorMessage } from '../api';
import { useModal } from '../composables/useModal';
import AppIcon from './AppIcon.vue';
import JsonEditor from './JsonEditor.vue';

defineProps<{
  /** Existing job names, suggested in the name field. */
  names: string[];
}>();

const emit = defineEmits<{ created: [name: string] }>();

const DEFAULT_JOB_DATA = '{\n  \n}';

const jobName = ref('');
const mode = ref<'once' | 'repeat'>('once');
const schedule = ref('');
const repeatEvery = ref('');
const firstRun = ref('');
const jobData = ref(DEFAULT_JOB_DATA);
const submitted = ref(false);
const serverError = ref('');
const isCreating = ref(false);

const { element, show, hide } = useModal({
  // Let the closing animation finish before the form empties
  onHidden: () => setTimeout(clear, 200),
});

function clear() {
  jobName.value = '';
  mode.value = 'once';
  schedule.value = '';
  repeatEvery.value = '';
  firstRun.value = '';
  jobData.value = DEFAULT_JOB_DATA;
  submitted.value = false;
  serverError.value = '';
  isCreating.value = false;
}

const parsedData = computed<{ value?: Record<string, unknown>; error?: string }>(() => {
  const text = jobData.value.trim();
  if (!text) return { value: {} };
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { error: 'Job data must be a JSON object, e.g. { "userId": 42 }.' };
    }
    return { value: parsed as Record<string, unknown> };
  } catch (error) {
    return { error: `Invalid JSON: ${errorMessage(error, 'unknown error')}` };
  }
});

const nameError = computed(() => (jobName.value.trim() ? '' : 'A job name is required.'));
const repeatError = computed(() =>
  mode.value === 'repeat' && !repeatEvery.value.trim() ? 'An interval or a cron expression is required.' : '',
);
const valid = computed(() => !nameError.value && !repeatError.value && !parsedData.value.error);

async function create() {
  submitted.value = true;
  serverError.value = '';
  if (!valid.value) return;

  isCreating.value = true;
  try {
    const name = jobName.value.trim();
    await api.createJob({
      jobName: name,
      // A one-off job without a time runs now
      jobSchedule: mode.value === 'once' ? schedule.value.trim() || 'now' : firstRun.value.trim(),
      jobRepeatEvery: mode.value === 'repeat' ? repeatEvery.value.trim() : '',
      jobData: parsedData.value.value ?? {},
    });
    emit('created', name);
    hide();
  } catch (error) {
    serverError.value = errorMessage(error, 'Could not create the job.');
  } finally {
    isCreating.value = false;
  }
}

defineExpose({ open: show });
</script>

<template>
  <div ref="element" class="modal fade" tabindex="-1" aria-labelledby="newJobTitle" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-md-down">
      <form class="modal-content" novalidate @submit.prevent="create">
        <div class="modal-header">
          <h2 id="newJobTitle" class="modal-title h5">New job</h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label for="jobNameInput" class="form-label">Name</label>
            <input
              id="jobNameInput"
              v-model="jobName"
              type="text"
              list="jobNameOptions"
              :class="['form-control', { 'is-invalid': submitted && nameError }]"
              placeholder="A job defined in your application, e.g. send-welcome-email"
              autocomplete="off"
            />
            <datalist id="jobNameOptions">
              <option v-for="name in names" :key="name" :value="name"></option>
            </datalist>
            <div v-if="submitted && nameError" class="invalid-feedback">{{ nameError }}</div>
            <div v-else class="form-text">Agenda only runs jobs whose name is defined by a worker.</div>
          </div>

          <div class="mb-2">
            <span class="form-label d-block">When</span>
            <div class="btn-group" role="group" aria-label="When the job runs">
              <input id="modeOnce" v-model="mode" type="radio" class="btn-check" value="once" />
              <label class="btn btn-outline-primary btn-sm" for="modeOnce"><AppIcon name="event" /> Once</label>
              <input id="modeRepeat" v-model="mode" type="radio" class="btn-check" value="repeat" />
              <label class="btn btn-outline-primary btn-sm" for="modeRepeat"><AppIcon name="repeat" /> Repeatedly</label>
            </div>
          </div>

          <div v-if="mode === 'once'" class="mb-3">
            <label for="scheduleInput" class="form-label small text-body-secondary">Run at</label>
            <input id="scheduleInput" v-model="schedule" type="text" class="form-control" placeholder="now" />
            <div class="form-text">Leave empty to run now, or write a time like “in 5 minutes”, “tomorrow at 9am” or an ISO date.</div>
          </div>
          <div v-else class="row g-3 mb-3">
            <div class="col-md-6">
              <label for="repeatInput" class="form-label small text-body-secondary">Every</label>
              <input id="repeatInput" v-model="repeatEvery" type="text" :class="['form-control', { 'is-invalid': submitted && repeatError }]" placeholder="e.g. 2 hours, 1 day, 0 3 * * *" />
              <div v-if="submitted && repeatError" class="invalid-feedback">{{ repeatError }}</div>
              <div v-else class="form-text">An interval like “15 minutes” or a cron expression.</div>
            </div>
            <div class="col-md-6">
              <label for="firstRunInput" class="form-label small text-body-secondary">First run (optional)</label>
              <input id="firstRunInput" v-model="firstRun" type="text" class="form-control" placeholder="e.g. tomorrow at 3am" />
              <div class="form-text">Leave empty to start from the interval.</div>
            </div>
          </div>

          <div class="mb-1">
            <label class="form-label" for="jobDataInput">Data</label>
            <JsonEditor id="jobDataInput" v-model="jobData" :class="['json-editor', 'json-editor-input', 'border', 'rounded', { 'is-invalid': submitted && parsedData.error }]" />
            <div v-if="submitted && parsedData.error" class="invalid-feedback d-block">{{ parsedData.error }}</div>
            <div v-else class="form-text">A JSON object passed to the job as <code>job.attrs.data</code>.</div>
          </div>

          <div v-if="serverError" class="alert alert-danger d-flex align-items-center gap-2 mt-3 mb-0 py-2" role="alert">
            <AppIcon name="error" /> {{ serverError }}
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="isCreating">
            <span v-if="isCreating" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
            {{ isCreating ? 'Creating…' : 'Create job' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
