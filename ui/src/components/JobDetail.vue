<script setup lang="ts">
import { computed, ref } from 'vue';

import type { JobEntry } from '../api';
import { useModal } from '../composables/useModal';
import { formatDate, formatJSON, statusClass, statusText } from '../jobs';
import JsonEditor from './JsonEditor.vue';
import TaskLogs from './TaskLogs.vue';

const props = defineProps<{ job: JobEntry | null }>();

// Bootstrap 5 does not stack modals, so the logs replace the details
// while they are open and the details come back when the logs close.
let showLogsWhenHidden = false;
let showDetailsWhenHidden = false;
const logsOpen = ref(false);

const {
  element: detailsElement,
  show: showDetails,
  hide: hideDetails,
} = useModal({
  onHidden: () => {
    if (!showLogsWhenHidden) return;
    showLogsWhenHidden = false;
    logsOpen.value = true;
    showLogs();
  },
});

const { element: logsElement, show: showLogs } = useModal({
  onHidden: () => {
    logsOpen.value = false;
    if (!showDetailsWhenHidden) return;
    showDetailsWhenHidden = false;
    showDetails();
  },
});

const hasData = computed(() => {
  const data = props.job?.job?.data;
  return typeof data === 'object' && data !== null ? Object.keys(data).length > 0 : Boolean(data);
});
const jobDataJSON = computed(() => formatJSON(props.job?.job?.data));

function formatDetailDate(date: string | null | undefined) {
  return formatDate(date, 'DD MMM YYYY, HH:mm:ss');
}

function openLogs() {
  showLogsWhenHidden = true;
  showDetailsWhenHidden = true;
  hideDetails();
}

defineExpose({ open: showDetails });
</script>

<template>
  <div>
    <!-- Job details -->
    <div ref="detailsElement" class="modal fade" tabindex="-1" aria-labelledby="jobDataModalLabel" aria-hidden="true">
      <div class="modal-dialog job-detail-dialog modal-xl">
        <div class="modal-content shadow-lg">
          <div class="modal-header bg-light border-bottom">
            <h5 id="jobDataModalLabel" class="modal-title">
              Job Details: <span class="fw-normal">{{ job && job.job ? job.job.name : 'Loading...' }}</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4">
            <div v-if="job && job.job">
              <div class="row mb-4">
                <div class="col-md-6">
                  <dl class="row dl-horizontal">
                    <dt class="col-sm-4">Name:</dt>
                    <dd class="col-sm-8">{{ job.job.name }}</dd>

                    <dt class="col-sm-4">Status:</dt>
                    <dd class="col-sm-8">
                      <span :class="['badge', statusClass(job), 'rounded-pill', 'px-2']">{{ statusText(job) }}</span>
                    </dd>

                    <template v-if="job.job.priority">
                      <dt class="col-sm-4">Priority:</dt>
                      <dd class="col-sm-8">{{ job.job.priority }}</dd>
                    </template>

                    <dt class="col-sm-4">Next Run:</dt>
                    <dd class="col-sm-8">{{ formatDetailDate(job.job.nextRunAt) }}</dd>
                  </dl>
                </div>
                <div class="col-md-6">
                  <dl class="row dl-horizontal">
                    <dt class="col-sm-4">Last Run:</dt>
                    <dd class="col-sm-8">{{ formatDetailDate(job.job.lastRunAt) }}</dd>

                    <dt class="col-sm-4">Last Finished:</dt>
                    <dd class="col-sm-8">{{ formatDetailDate(job.job.lastFinishedAt) }}</dd>

                    <dt class="col-sm-4">Locked:</dt>
                    <dd class="col-sm-8">{{ formatDetailDate(job.job.lockedAt) }}</dd>
                  </dl>
                </div>
              </div>

              <h6>Job Data (Metadata)</h6>
              <JsonEditor v-if="hasData" class="json-editor json-editor-view border rounded mb-4" :model-value="jobDataJSON" readonly />
              <p v-else class="text-muted"><i>No data associated with this job.</i></p>

              <div v-if="job.failed" class="mt-3">
                <h6>Failure Details</h6>
                <div class="p-3 bg-danger-light text-danger border border-danger rounded">
                  <dl class="row dl-horizontal mb-0">
                    <dt class="col-sm-3">Fail Count:</dt>
                    <dd class="col-sm-9">{{ job.job.failCount }}</dd>
                    <dt class="col-sm-3">Failed At:</dt>
                    <dd class="col-sm-9">{{ formatDetailDate(job.job.failedAt) }}</dd>
                    <dt class="col-sm-3">Reason:</dt>
                    <dd class="col-sm-9"><pre class="mb-0 failure-reason">{{ job.job.failReason }}</pre></dd>
                  </dl>
                </div>
              </div>
            </div>
            <div v-else class="text-center text-muted py-5">
              Loading job details...
            </div>
          </div>
          <div class="modal-footer bg-light border-top">
            <button type="button" class="btn btn-info me-auto" :disabled="!job?.job?._id" @click="openLogs">
              <i class="material-icons md-18 align-middle me-1">history</i> Show Execution Logs
            </button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Execution logs -->
    <div ref="logsElement" class="modal fade" tabindex="-1" aria-labelledby="logModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content shadow-lg">
          <div class="modal-header bg-light border-bottom">
            <h5 id="logModalLabel" class="modal-title">
              Execution Logs: <span class="fw-normal">{{ job && job.job ? job.job.name : '...' }}</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0">
            <template v-if="logsOpen">
              <TaskLogs v-if="job?.job?._id" :key="job.job._id" :job-id="job.job._id" />
              <div v-else class="alert alert-warning m-3">Cannot load logs: Job ID is missing or job data not fully loaded.</div>
            </template>
          </div>
          <div class="modal-footer bg-light border-top">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
