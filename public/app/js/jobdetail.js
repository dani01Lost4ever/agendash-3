// Remove log-related data, methods, watch, created from job-detail
// Keep only props, filters, and methods needed for displaying job *details*
const jobDetail = Vue.component('job-detail', {
  props: ['job'],
  // --- REMOVED log-related data properties ---
  // data: () => ({
  //   logs: [],
  //   loading: false,
  //   error: null
  // }),
  filters: { // Keep filters if used for job data display
    formatJSON(jsonstr) {
      try {
        if (typeof jsonstr === 'object' && jsonstr !== null) {
          return JSON.stringify(jsonstr, null, 2);
        }
        if (typeof jsonstr === 'string') {
          try {
            const parsed = JSON.parse(jsonstr);
            return JSON.stringify(parsed, null, 2);
          } catch (e) {
            return String(jsonstr);
          }
        }
        return String(jsonstr);
      } catch (e) {
        return String(jsonstr);
      }
    },
  },
  methods: {
    // Keep methods needed for displaying job details
    formatDate(date) {
      return date && moment(date).isValid() ? moment(date).format("DD MMM YYYY, HH:mm:ss") : 'N/A';
    },
    getStatusClass(job) {
      if (!job) return 'badge-secondary';
      if (job.failed) return 'badge-danger';
      if (job.running) return 'badge-warning';
      if (job.completed) return 'badge-success';
      if (job.queued) return 'badge-primary';
      if (job.scheduled || job.repeating) return 'badge-info';
      return 'badge-secondary';
    },
    getStatusText(job) {
      if (!job) return 'Unknown';
      if (job.failed) return 'Failed';
      if (job.running) return 'Running';
      if (job.completed) return 'Completed';
      if (job.queued) return 'Queued';
      if (job.repeating) return `Repeating (${job.job?.repeatInterval || '?'})`; // Added safe navigation
      if (job.scheduled) return 'Scheduled';
      return 'Unknown';
    }
    // --- REMOVED log-related methods (fetchLogs, getLogEntryClass, etc.) ---
  },
  // --- REMOVED log-related watch and created hooks ---
  // watch: { ... },
  // created() { ... },

  // Template remains largely the same, but ensure v-if guards are present
  template: `
  <div>
    <!-- Main Job Data Modal (#modalData) -->
    <div class="modal fade" id="modalData" tabindex="-1" role="dialog" aria-labelledby="jobDataModalLabel" aria-hidden="true">
      <div class="modal-dialog job-detail-dialog modal-xl" role="document">
        <div class="modal-content shadow-lg">
          <div class="modal-header bg-light border-bottom">
            <!-- Add v-if guard for header content -->
            <h5 class="modal-title" id="jobDataModalLabel">
                Job Details: <span class="font-weight-normal">{{ job && job.job ? job.job.name : 'Loading...' }}</span>
            </h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body p-4">
            <!-- Add v-if guard around the main content area -->
            <div v-if="job && job.job">
                <div class="row mb-4">
                  <div class="col-md-6">
                    <dl class="row dl-horizontal">
                      <dt class="col-sm-4">Name:</dt>
                      <dd class="col-sm-8">{{ job.job.name }}</dd>

                      <dt class="col-sm-4">Status:</dt>
                      <dd class="col-sm-8">
                        <!-- Pass the whole job object to helpers -->
                        <span :class="['badge', getStatusClass(job), 'badge-pill', 'px-2']">{{ getStatusText(job) }}</span>
                      </dd>

                      <dt class="col-sm-4" v-if="job.job.priority">Priority:</dt>
                      <dd class="col-sm-8" v-if="job.job.priority">{{ job.job.priority }}</dd>

                      <dt class="col-sm-4">Next Run:</dt>
                      <dd class="col-sm-8">{{ formatDate(job.job.nextRunAt) }}</dd>
                    </dl>
                  </div>
                  <div class="col-md-6">
                     <dl class="row dl-horizontal">
                       <dt class="col-sm-4">Last Run:</dt>
                       <dd class="col-sm-8">{{ formatDate(job.job.lastRunAt) }}</dd>

                       <dt class="col-sm-4">Last Finished:</dt>
                       <dd class="col-sm-8">{{ formatDate(job.job.lastFinishedAt) }}</dd>

                       <dt class="col-sm-4">Locked:</dt>
                       <dd class="col-sm-8">{{ formatDate(job.job.lockedAt) }}</dd>
                     </dl>
                  </div>
                </div>

                <h6>Job Data (Metadata)</h6>
                <prism-editor v-if="job.job.data && Object.keys(job.job.data).length > 0" class="json-editor border rounded mb-4" style="max-height: 300px;" :lineNumbers="true" :readonly="true" :code="job.job.data | formatJSON" language="json"></prism-editor>
                <p v-else class="text-muted"><i>No data associated with this job.</i></p>

                <div v-if='job.failed' class="mt-3">
                  <h6>Failure Details</h6>
                  <div class="p-3 bg-danger-light text-danger border border-danger rounded">
                      <dl class="row dl-horizontal mb-0">
                          <dt class="col-sm-3">Fail Count:</dt>
                          <dd class="col-sm-9">{{job.job.failCount}}</dd>
                          <dt class="col-sm-3">Failed At:</dt>
                          <dd class="col-sm-9">{{formatDate(job.job.failedAt)}}</dd>
                          <dt class="col-sm-3">Reason:</dt>
                          <dd class="col-sm-9"><pre class="mb-0 failure-reason">{{job.job.failReason}}</pre></dd>
                      </dl>
                  </div>
                </div>
            </div>
            <!-- Show loading message if job data isn't ready -->
            <div v-else class="text-center text-muted py-5">
                Loading job details...
            </div>
          </div>
          <div class="modal-footer bg-light border-top">
            <!-- Button to trigger the Log Modal -->
            <!-- Ensure disabled check uses safe navigation -->
            <button type="button" class="btn btn-info mr-auto" data-toggle="modal" data-target="#modalLogs" :disabled="!job?.job?._id">
                <i class="material-icons md-18 align-middle mr-1">history</i> Show Execution Logs
            </button>
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Log Modal (#modalLogs) - Contains the task-logs component -->
    <div class="modal fade" id="modalLogs" tabindex="-1" role="dialog" aria-labelledby="logModalLabel" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable" role="document">
        <div class="modal-content shadow-lg">
          <div class="modal-header bg-light border-bottom">
            <h5 class="modal-title" id="logModalLabel">
                Execution Logs: <span class="font-weight-normal">{{ job && job.job ? job.job.name : '...' }}</span>
            </h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body p-0">
            <!-- Embed the task-logs component, passing the jobId -->
            <!-- Use v-if to ensure job.job._id exists before rendering task-logs -->
            <!-- Use :key to force re-render if job changes -->
            <task-logs v-if="job && job.job && job.job._id" :job-id="job.job._id" :key="job.job._id"></task-logs>
            <!-- Show message if ID is missing -->
            <div v-else class="alert alert-warning m-3">Cannot load logs: Job ID is missing or job data not fully loaded.</div>
          </div>
          <div class="modal-footer bg-light border-top">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  `,
});
