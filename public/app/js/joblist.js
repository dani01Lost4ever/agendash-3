const jobList = Vue.component("job-list", {
  data: () => ({
    multijobs: [],
    currentSort: "name",
    currentSortDir: "asc",
  }),
  props: ["jobs", "pagesize", "pagenumber", "totalPages", "sendClean", "loading"],
  computed: {
    sortedJobs: function () {
      // Keep existing sort logic
      var sortedJobs = [...this.jobs].sort((a, b) => { // Use spread to avoid mutating prop
        let displayA, displayB;
        const sortField = this.currentSort;

        // Handle potential missing properties gracefully
        const valA = a.job && a.job[sortField] !== undefined ? a.job[sortField] : null;
        const valB = b.job && b.job[sortField] !== undefined ? b.job[sortField] : null;

        if (sortField === "name") {
          displayA = valA ? String(valA).toLowerCase() : '';
          displayB = valB ? String(valB).toLowerCase() : '';
        } else { // Assume date fields
          displayA = valA ? moment(valA) : moment(0); // Use epoch for null dates to sort consistently
          displayB = valB ? moment(valB) : moment(0);
          if (!moment(valA).isValid()) displayA = moment(0);
          if (!moment(valB).isValid()) displayB = moment(0);
        }

        let modifier = 1;
        if (this.currentSortDir === "desc") modifier = -1;

        if (displayA < displayB) return -1 * modifier;
        if (displayA > displayB) return 1 * modifier;
        return 0;
      });
      return sortedJobs;
    },
  },
  watch: {
    jobs() {
      this.multijobs = [];
    },
  },
  methods: {
    sort(s) {
      if (s === this.currentSort) {
        this.currentSortDir = this.currentSortDir === "asc" ? "desc" : "asc";
      } else {
        this.currentSort = s;
        this.currentSortDir = 'asc';
      }
    },
    sendQueued() {
      this.$emit("confirm-multi-requeue", this.multijobs);
      // Assuming the modal #modalRequeueSureMulti is opened by the button itself
      // If not, you'd add $('#modalRequeueSureMulti').modal('show'); here
    },
    sendDelete() {
      this.$emit("confirm-multi-delete", this.multijobs);
      // Assuming the modal #modalDeleteSureMulti is opened by the button itself
      // If not, you'd add $('#modalDeleteSureMulti').modal('show'); here
    },
    cleanMulti() {
      this.multijobs = [];
    },
    formatTitle(date) {
      if (!date || !moment(date).isValid()) return 'N/A';
      return moment(date).format("YYYY-MM-DD HH:mm:ss Z");
    },
    formatDate(date) {
      if (!date || !moment(date).isValid()) return 'N/A';
      return moment(date).fromNow();
    },
    checkAllCheckboxes() {
      const checkboxes = this.$el.querySelectorAll(".checkbox-triggerable");
      const firstCheckboxChecked = checkboxes.length > 0 ? checkboxes[0].checked : false;
      const shouldCheck = !firstCheckboxChecked;
      checkboxes.forEach(checkbox => {
        // Directly set checked state and update v-model array manually
        // This avoids relying on checkbox.click() which can be inconsistent
        const value = checkbox.value;
        const index = this.multijobs.indexOf(value);

        if (shouldCheck) {
          if (index === -1) {
            this.multijobs.push(value);
          }
          checkbox.checked = true;
        } else {
          if (index > -1) {
            this.multijobs.splice(index, 1);
          }
          checkbox.checked = false;
        }
      });
    },
    toggleList(job) {
      const jobId = job.job._id;
      const index = this.multijobs.indexOf(jobId);
      if (index > -1) {
        this.multijobs.splice(index, 1);
      } else {
        this.multijobs.push(jobId);
      }
      // Manually update the checkbox state if needed, though v-model should handle it
      const checkbox = this.$el.querySelector(`#check-${jobId}`) || this.$el.querySelector(`#card-check-${jobId}`);
      if (checkbox) {
        checkbox.checked = index === -1; // Check if it was just added
      }
    },
    getStatusClass(job) {
      if (job.failed) return 'badge-danger';
      if (job.running) return 'badge-warning';
      if (job.completed) return 'badge-success';
      if (job.queued) return 'badge-primary';
      if (job.scheduled || job.repeating) return 'badge-info';
      return 'badge-secondary';
    },
    getStatusText(job) {
      if (job.failed) return 'Failed';
      if (job.running) return 'Running';
      if (job.completed) return 'Completed';
      if (job.queued) return 'Queued';
      if (job.repeating) return `Repeating (${job.job.repeatInterval || '?'})`;
      if (job.scheduled) return 'Scheduled';
      return 'Unknown';
    },

    // --- NEW Action Handler Methods ---
    handleRequeueClick(job) {
      this.$emit('confirm-requeue', job); // Emit the event first
      $('#modalRequeueSure').modal('show'); // Then programmatically open the modal
    },
    handleDetailClick(job) {
      this.$emit('show-job-detail', job); // Emit the event first
      $('#modalData').modal('show'); // Then programmatically open the modal
    },
    handleDeleteClick(job) {
      this.$emit('confirm-delete', job); // Emit the event first
      $('#modalDeleteSure').modal('show'); // Then programmatically open the modal
    }
    // --- End NEW Methods ---
  },
  template: `
  <div v-on:sendClean="cleanMulti">
        <!-- Multi Action Bar -->
        <div class="d-flex justify-content-end align-items-center mb-3 p-2 bg-light border rounded shadow-sm">
            <span class="mr-3 text-muted">{{ multijobs.length }} job(s) selected</span>
            <!-- Keep data-toggle here for multi-action buttons as they don't pass specific job data -->
            <button :disabled="!multijobs.length" data-toggle="modal" data-target="#modalRequeueSureMulti" @click="sendQueued" class="btn btn-sm btn-primary mr-2" data-placement="top" title="Requeue selected jobs">
                <i class="material-icons md-18 align-middle mr-1">update</i> Requeue Selected
            </button>
            <button :disabled="!multijobs.length" data-toggle="modal" data-target="#modalDeleteSureMulti" @click="sendDelete" class="btn btn-sm btn-danger" data-placement="top" title="Delete selected jobs">
                 <i class="material-icons md-18 align-middle mr-1">delete_sweep</i> Delete Selected
            </button>
        </div>

        <!-- Desktop Table View -->
        <table class="table table-hover table-striped d-none d-xl-table border rounded shadow-sm">
          <thead class="thead-light">
            <tr>
              <th width="5%" class="text-center py-2"><input type="checkbox" @click="checkAllCheckboxes()" title="Select/Deselect All"/></th>
              <th width="10%" @click="sort('status')" scope="col" class="py-2 clickable"> Status </th>
              <th width="25%" @click="sort('name')" scope="col" class="py-2 clickable"> Name <i class="material-icons md-18 sortable">{{ currentSort === 'name' ? (currentSortDir === 'asc' ? 'arrow_drop_down' : 'arrow_drop_up') : 'unfold_more' }}</i></th>
              <th width="15%" @click="sort('lastRunAt')" scope="col" class="py-2 clickable"> Last run <i class="material-icons md-18 sortable">{{ currentSort === 'lastRunAt' ? (currentSortDir === 'asc' ? 'arrow_drop_up' : 'arrow_drop_down') : 'unfold_more' }}</i></th>
              <th width="15%" @click="sort('nextRunAt')" scope="col" class="py-2 clickable"> Next run <i class="material-icons md-18 sortable">{{ currentSort === 'nextRunAt' ? (currentSortDir === 'asc' ? 'arrow_drop_up' : 'arrow_drop_down') : 'unfold_more' }}</i></th>
              <th width="15%" @click="sort('lastFinishedAt')" scope="col" class="py-2 clickable"> Finished <i class="material-icons md-18 sortable">{{ currentSort === 'lastFinishedAt' ? (currentSortDir === 'asc' ? 'arrow_drop_up' : 'arrow_drop_down') : 'unfold_more' }}</i></th>
              <th width="15%" scope="col" class="text-center py-2"> Actions </th>
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr>
              <td colspan="7" class="text-center py-5">
                  <div class="spinner-border text-primary" role="status"></div>
                  <div class="mt-2 text-muted">Loading Jobs...</div>
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr v-for="job in sortedJobs" :key="job.job._id" :class="{'table-active': multijobs.includes(job.job._id)}">
                  <td class="text-center mult-select py-2 align-middle">
                    <!-- Use :value for binding, :id for label association -->
                    <input v-model="multijobs" :id="'check-'+job.job._id" class="checkbox-triggerable" type="checkbox" :value="job.job._id"></input>
                  </td>
                  <td class="py-2 align-middle" @click="toggleList(job)">
                    <span :class="['badge', getStatusClass(job), 'badge-pill', 'px-2']">{{ getStatusText(job) }}</span>
                  </td>
                  <td class="job-name py-2 align-middle" @click="toggleList(job)"> {{job.job.name}} </td>
                  <td class="job-lastRunAt py-2 align-middle" :title="formatTitle(job.job.lastRunAt)" @click="toggleList(job)"> {{ formatDate(job.job.lastRunAt) }} </td>
                  <td class="job-nextRunAt py-2 align-middle" :title="formatTitle(job.job.nextRunAt)" @click="toggleList(job)"> {{ formatDate(job.job.nextRunAt) }} </td>
                  <td class="job-finishedAt py-2 align-middle" :title="formatTitle(job.job.lastFinishedAt)" @click="toggleList(job)"> {{ formatDate(job.job.lastFinishedAt) }} </td>
                  <td class="job-actions text-center py-2 align-middle">
                    <!-- REMOVED data-toggle/data-target, ADDED call to new methods -->
                    <i class="material-icons md-dark md-custom action-btn mx-1 text-primary" @click.stop="handleRequeueClick(job)" data-placement="top" title="Requeue Job">update</i>
                    <i class="material-icons md-dark md-custom action-btn mx-1 text-info"    @click.stop="handleDetailClick(job)"  data-placement="top" title="View Details & Logs">visibility</i>
                    <i class="material-icons md-dark md-custom action-btn mx-1 text-danger"  @click.stop="handleDeleteClick(job)"  data-placement="top" title="Delete Job">delete_forever</i>
                  </td>
            </tr>
            <tr v-if="!jobs || jobs.length === 0">
                <td colspan="7" class="text-center text-muted py-4">No jobs found matching your criteria.</td>
            </tr>
          </tbody>
        </table>

        <!-- Mobile/Tablet Card View -->
        <div class="d-xl-none">
          <div v-if="loading" class="text-center py-5">
              <div class="spinner-border text-primary" role="status"></div>
              <div class="mt-2 text-muted">Loading Jobs...</div>
          </div>
          <div v-else class="row">
            <div v-for="job in sortedJobs" :key="job.job._id" class="col-12 col-sm-6 col-md-6 col-lg-4 mb-3">
              <div class="card h-100 shadow-sm" :class="{'border-primary': multijobs.includes(job.job._id)}">
                <div class="card-header d-flex justify-content-between align-items-center py-2">
                  <div class="form-check d-inline-flex align-items-center mr-2" style="min-width: 0; flex-grow: 1;"> <!-- Allow label to grow -->
                     <input v-model="multijobs" :id="'card-check-'+job.job._id" type="checkbox" :value="job.job._id" class="form-check-input mt-0 mr-2" @click.stop> <!-- Added margin -->
                     <label :for="'card-check-'+job.job._id" class="form-check-label font-weight-bold text-truncate clickable mb-0" @click="toggleList(job)"> <!-- Added mb-0 -->
                       {{job.job.name}}
                     </label>
                  </div>
                  <div class="job-actions flex-shrink-0 ml-2"> <!-- Added margin -->
                    <!-- REMOVED data-toggle/data-target, ADDED call to new methods -->
                    <!-- Corrected classes from previous context if they were wrong -->
                    <i class="material-icons md-dark md-custom action-btn mx-1 text-primary" @click.stop="handleRequeueClick(job)" data-placement="top" title="Requeue">update</i>
                    <i class="material-icons md-dark md-custom action-btn mx-1 text-info"    @click.stop="handleDetailClick(job)"  data-placement="top" title="Details & Logs">visibility</i>
                    <i class="material-icons md-dark md-custom action-btn mx-1 text-danger"  @click.stop="handleDeleteClick(job)"  data-placement="top" title="Delete">delete_forever</i>
                  </div>
                </div>
                <div class="card-body py-2 px-3 clickable" @click="toggleList(job)"> <!-- Make body clickable -->
                  <div class="text-center mb-2">
                    <span :class="['badge', getStatusClass(job), 'badge-pill', 'px-2', 'py-1']">{{ getStatusText(job) }}</span>
                  </div>
                  <div class="row small text-muted">
                    <div class="col-6 mb-1"><strong>Last run:</strong></div>
                    <div class="col-6 mb-1 text-right" :title="formatTitle(job.job.lastRunAt)">{{ formatDate(job.job.lastRunAt) }}</div>
                    <div class="col-6 mb-1"><strong>Next run:</strong></div>
                    <div class="col-6 mb-1 text-right" :title="formatTitle(job.job.nextRunAt)">{{ formatDate(job.job.nextRunAt) }}</div>
                    <div class="col-6"><strong>Finished:</strong></div>
                    <div class="col-6 text-right" :title="formatTitle(job.job.lastFinishedAt)">{{ formatDate(job.job.lastFinishedAt) }}</div>
                  </div>
                </div>
              </div>
            </div>
             <div v-if="!jobs || jobs.length === 0" class="col-12 text-center text-muted py-4">
                No jobs found matching your criteria.
             </div>
          </div>
        </div>

        <!-- Pagination -->
        <div class="row mt-3" v-if="totalPages > 1 || pagenumber > 1">
            <div class="col d-flex flex-column flex-sm-row justify-content-center align-items-center">
              <nav aria-label="Page navigation" class="mb-2 mb-sm-0 mr-sm-3">
                  <ul class="pagination pagination-sm mb-0">
                    <li class="page-item" :class="{disabled: pagenumber === 1}">
                        <a class="page-link" href="#" @click.prevent="$emit('pagechange', 'prev')">Previous</a>
                    </li>
                    <li class="page-item" :class="{disabled: pagenumber >= totalPages}">
                        <a class="page-link" href="#" @click.prevent="$emit('pagechange', 'next')">Next</a>
                    </li>
                  </ul>
              </nav>
              <span class="text-muted small">Page: {{pagenumber}} / {{totalPages}}</span>
            </div>
        </div>
</div>
  `,
});
