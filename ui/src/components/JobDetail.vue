<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { api, ApiError, errorMessage, type JobEntry } from '../api';
import { ACTIONS, type JobAction } from '../actions';
import { useModal } from '../composables/useModal';
import { formatDate, formatJSON, fromNow, isDisabled, mainState, STATE_META, statusText, statusTone } from '../jobs';
import AppIcon from './AppIcon.vue';
import JsonEditor from './JsonEditor.vue';
import StateBadge from './StateBadge.vue';
import TaskLogs from './TaskLogs.vue';

const props = defineProps<{
  /** The job as listed, shown until its fresh copy arrives. */
  listedJob: JobEntry | null;
  /** Changes when the dashboard refreshes. */
  refreshKey: number | null;
  /** An action on this job is in flight. */
  busy: boolean;
}>();

const emit = defineEmits<{
  action: [action: JobAction, job: JobEntry];
  closed: [];
}>();

const current = ref<JobEntry | null>(null);
const isOpen = ref(false);
const tab = ref<'overview' | 'logs'>('overview');
const pendingAction = ref<JobAction | null>(null);
const missing = ref(false);

const { element, show, hide } = useModal({
  onHidden: () => {
    isOpen.value = false;
    pendingAction.value = null;
    emit('closed');
  },
});

async function reload() {
  const id = current.value?.job._id;
  if (!id) return;
  try {
    current.value = await api.getJob(id);
    missing.value = false;
  } catch (error) {
    // Deleted meanwhile: keep showing the last known copy
    if (error instanceof ApiError && error.status === 404) missing.value = true;
    else console.error('Error loading job:', error);
  }
}

function open(tabName: 'overview' | 'logs' = 'overview') {
  current.value = props.listedJob;
  missing.value = false;
  tab.value = tabName;
  pendingAction.value = null;
  isOpen.value = true;
  show();
  void reload();
}

watch(() => props.refreshKey, () => {
  if (isOpen.value) void reload();
});

const job = computed(() => current.value);
const disabled = computed(() => isDisabled(job.value));
const hasData = computed(() => {
  const data = job.value?.job.data;
  return typeof data === 'object' && data !== null ? Object.keys(data).length > 0 : Boolean(data);
});
const dataJSON = computed(() => formatJSON(job.value?.job.data));
const stateIcon = computed(() => {
  const state = mainState(job.value);
  return state ? STATE_META[state].icon : 'help';
});

const timeline = computed(() => {
  const attrs = job.value?.job;
  if (!attrs) return [];
  return [
    { label: 'Next run', value: attrs.nextRunAt },
    { label: 'Last run', value: attrs.lastRunAt },
    { label: 'Last finished', value: attrs.lastFinishedAt },
    { label: 'Locked', value: attrs.lockedAt },
  ];
});

const PRIORITIES: Record<number, string> = { [-20]: 'Lowest', [-10]: 'Low', 0: 'Normal', 10: 'High', 20: 'Highest' };
const priorityLabel = computed(() => {
  const priority = job.value?.job.priority ?? 0;
  return PRIORITIES[priority] ? `${PRIORITIES[priority]} (${priority})` : String(priority);
});

function request(action: JobAction) {
  if (!job.value) return;
  if (ACTIONS[action].confirm) {
    pendingAction.value = action;
  } else {
    emit('action', action, job.value);
  }
}

function confirmPending() {
  if (job.value && pendingAction.value) {
    emit('action', pendingAction.value, job.value);
    pendingAction.value = null;
  }
}

async function copyId() {
  if (!job.value) return;
  try {
    await navigator.clipboard.writeText(job.value.job._id);
  } catch (error) {
    console.warn('Clipboard unavailable:', errorMessage(error, 'unknown error'));
  }
}

defineExpose({ open, hide, reload });
</script>

<template>
  <div ref="element" class="modal fade job-detail" tabindex="-1" aria-labelledby="jobDetailTitle" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-md-down">
      <div class="modal-content">
        <div class="modal-header align-items-start">
          <div class="min-w-0">
            <h2 id="jobDetailTitle" class="h5 mb-1 text-break">{{ job?.job.name ?? 'Job' }}</h2>
            <div v-if="job" class="d-flex flex-wrap align-items-center gap-2">
              <StateBadge :tone="statusTone(job)" :label="statusText(job)" :icon="stateIcon" />
              <StateBadge v-if="disabled" tone="secondary" label="Disabled" icon="pause_circle" />
              <StateBadge v-if="job.job.repeatInterval" tone="secondary" :label="`Every ${job.job.repeatInterval}`" icon="repeat" />
              <button type="button" class="btn btn-link btn-sm p-0 text-body-secondary text-decoration-none job-id" title="Copy the job ID" @click="copyId">
                <code>{{ job.job._id }}</code> <AppIcon name="content_copy" />
              </button>
            </div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="modal-body">
          <div v-if="missing" class="alert alert-warning py-2">This job no longer exists. It was deleted or replaced.</div>

          <ul class="nav nav-underline mb-3" role="tablist">
            <li class="nav-item" role="presentation">
              <button type="button" role="tab" :class="['nav-link', { active: tab === 'overview' }]" :aria-selected="tab === 'overview'" @click="tab = 'overview'">Overview</button>
            </li>
            <li class="nav-item" role="presentation">
              <button type="button" role="tab" :class="['nav-link', { active: tab === 'logs' }]" :aria-selected="tab === 'logs'" @click="tab = 'logs'">Execution log</button>
            </li>
          </ul>

          <div v-if="job && tab === 'overview'" role="tabpanel">
            <div v-if="job.failed || job.job.failReason" :class="['failure-panel', { past: !job.failed }]">
              <div class="d-flex align-items-center gap-2 fw-medium mb-1">
                <AppIcon name="error" />
                {{ job.failed ? 'Last run failed' : 'Previous failure' }}
                <span class="small fw-normal ms-auto">{{ job.job.failCount ?? 0 }} failure{{ job.job.failCount === 1 ? '' : 's' }} · {{ fromNow(job.job.failedAt) }}</span>
              </div>
              <pre class="failure-reason mb-0">{{ job.job.failReason }}</pre>
            </div>

            <div class="detail-grid">
              <div v-for="item in timeline" :key="item.label" class="detail-item">
                <div class="detail-label">{{ item.label }}</div>
                <div class="detail-value">{{ fromNow(item.value) }}</div>
                <div v-if="item.value" class="detail-sub">{{ formatDate(item.value) }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Priority</div>
                <div class="detail-value">{{ priorityLabel }}</div>
              </div>
              <div class="detail-item">
                <div class="detail-label">Repeats</div>
                <div class="detail-value">{{ job.job.repeatInterval || 'No' }}</div>
                <div v-if="job.job.repeatTimezone" class="detail-sub">{{ job.job.repeatTimezone }}</div>
              </div>
            </div>

            <h3 class="h6 mt-4 mb-2">Data</h3>
            <JsonEditor v-if="hasData" class="json-editor json-editor-view border rounded" :model-value="dataJSON" readonly />
            <p v-else class="text-body-secondary fst-italic">No data.</p>
          </div>

          <div v-if="job && tab === 'logs' && isOpen" role="tabpanel">
            <TaskLogs :job-id="job.job._id" :refresh-key="refreshKey" />
          </div>
        </div>

        <div class="modal-footer">
          <template v-if="pendingAction && job">
            <span class="me-auto small">
              <strong>{{ ACTIONS[pendingAction].label }}?</strong>
              <span class="text-body-secondary"> {{ ACTIONS[pendingAction].description }}</span>
            </span>
            <button type="button" class="btn btn-outline-secondary" @click="pendingAction = null">Cancel</button>
            <button type="button" :class="['btn', `btn-${ACTIONS[pendingAction].tone}`]" :disabled="busy" @click="confirmPending">
              {{ ACTIONS[pendingAction].label }}
            </button>
          </template>
          <template v-else>
            <div class="d-flex flex-wrap gap-2 me-auto agendash-write">
              <button type="button" class="btn btn-outline-success btn-sm" :disabled="!job || busy || disabled || job.running || missing" @click="request('run')">
                <AppIcon :name="ACTIONS.run.icon" /> {{ ACTIONS.run.label }}
              </button>
              <button type="button" class="btn btn-outline-primary btn-sm" :disabled="!job || busy || missing" @click="request('requeue')">
                <AppIcon :name="ACTIONS.requeue.icon" /> {{ ACTIONS.requeue.label }}
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!job || busy || missing" @click="request(disabled ? 'enable' : 'disable')">
                <AppIcon :name="disabled ? ACTIONS.enable.icon : ACTIONS.disable.icon" /> {{ disabled ? ACTIONS.enable.label : ACTIONS.disable.label }}
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm" :disabled="!job || busy || missing" @click="request('delete')">
                <AppIcon :name="ACTIONS.delete.icon" /> {{ ACTIONS.delete.label }}
              </button>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Close</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
