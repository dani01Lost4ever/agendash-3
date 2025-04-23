const sidebar = Vue.component("sidebar", {
  props: ["overview", "pagesize", "loading"],
  computed: {
    sortedArray() {
      function compare(a, b) {
        let displayNameA = a.displayName.toLowerCase();
        let displayNameB = b.displayName.toLowerCase();
        // Keep "All Jobs" potentially at the top or handle separately if needed
        // if (displayNameA === "all jobs") return -1; // Example: force "All Jobs" first
        // if (displayNameB === "all jobs") return 1;
        if (displayNameA < displayNameB) return -1;
        if (displayNameA > displayNameB) return 1;
        return 0;
      }
      // Separate "All Jobs" and sort the rest
      const allJobs = this.overview.find(item => item.displayName === 'All Jobs');
      const otherJobs = this.overview.filter(item => item.displayName !== 'All Jobs').sort(compare);
      return allJobs ? [allJobs, ...otherJobs] : otherJobs; // Put "All Jobs" first if it exists
    },
  },
  methods: {
    flexgrow(number) {
      // Keep this logic, it visually represents proportions
      return Math.log2(1 + number);
    },
    searchSpecificJob(job, type) {
      const jobName = (job === "All Jobs") ? "" : job; // Use empty string for "All Jobs" search
      this.$emit(
        "search-sidebar",
        jobName, // Pass empty string for 'All Jobs'
        "", // search
        "", // property
        this.pagesize,
        "", // skip
        "", // refresh
        type, // jobType
        "" // isObjectId
      );
      // Update URL only if type is specified for simplicity, or adjust as needed
      if (type) {
        const url = new URL(window.location);
        url.searchParams.set("jobType", type);
        if (jobName) {
          url.searchParams.set("name", jobName); // Optionally add job name to URL too
        } else {
          url.searchParams.delete("name");
        }
        window.history.replaceState({}, '', url);
      } else {
        // Clear type and potentially name from URL when clicking the main job row
        const url = new URL(window.location);
        url.searchParams.delete("jobType");
        if (jobName) {
          url.searchParams.set("name", jobName);
        } else {
          url.searchParams.delete("name");
        }
        window.history.replaceState({}, '', url);
      }
    },
  },
  template: `
    <div class="col sidebar pt-3 pb-3 border-right bg-light"> <!-- Added padding, border, bg -->
      <div class="row mb-3 px-2"> <!-- Added padding -->
        <div class="col">
           <button data-toggle="modal" data-target="#modalNewJob" @click="$emit('new-job')" data-placement="top" title="Add a new job" class="btn btn-block btn-success shadow-sm"><i class="oi oi-plus IcoInButton"></i> New Job</button> <!-- Changed to btn-success, added shadow -->
        </div>
      </div> <!-- row -->
      <div class="row p-0">
        <div v-if="loading" class="col-12 my-5 text-center">
            <div class="text-center my-5 py-5">
              <div class="spinner-border text-primary" role="status"></div> <!-- Added text-primary -->
              <div class="mt-2 text-muted">Loading Jobs...</div> <!-- Added text-muted -->
            </div>
        </div>
        <div v-else class="col">
          <!-- Job Type Loop -->
          <div class="mb-4" v-for="type in sortedArray" :key="type.displayName"> <!-- Added mb-4 for spacing between job types -->
            <!-- Main Job Type Row -->
            <div class="d-flex align-items-center p-2 rounded clickable-row job-type-header" @click="searchSpecificJob(type.displayName,'')"> <!-- Added padding, rounded, clickable class -->
              <div class="mr-auto font-weight-bold">{{type.displayName}}</div>
              <div class="badge badge-secondary badge-pill px-2">{{type.total}}</div> <!-- Used badge-pill -->
            </div>
            <!-- Progress Bar -->
            <div class="col-12 p-1 mt-1 mb-2"> <!-- Adjusted margins -->
              <div class="progress" style="height: 8px;"> <!-- Made progress bar thinner -->
                <div class="progress-bar bg-info" role="progressbar" :style="{'flex-grow': flexgrow(type.scheduled)}" title="Scheduled"></div>
                <div class="progress-bar bg-primary" role="progressbar" :style="{'flex-grow': flexgrow(type.queued)}" title="Queued"></div>
                <div class="progress-bar bg-warning" role="progressbar" :style="{'flex-grow': flexgrow(type.running)}" title="Running"></div>
                <div class="progress-bar bg-success" role="progressbar" :style="{'flex-grow': flexgrow(type.completed)}" title="Completed"></div>
                <div class="progress-bar bg-danger" role="progressbar" :style="{'flex-grow': flexgrow(type.failed)}" title="Failed"></div>
                <!-- Note: Repeating is not usually shown in progress bar as it overlaps other statuses -->
              </div>
            </div>
             <!-- Status Breakdown List -->
            <div class="list-group list-group-flush small"> <!-- Use list-group for structure -->
              <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName,'scheduled')">
                <div><span class="status-dot bg-info"></span> Scheduled</div>
                <span class="badge badge-info badge-pill">{{type.scheduled}}</span>
              </div>
              <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName,'queued')">
                 <div><span class="status-dot bg-primary"></span> Queued</div>
                 <span class="badge badge-primary badge-pill">{{type.queued}}</span>
              </div>
              <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName,'running')">
                 <div><span class="status-dot bg-warning"></span> Running</div>
                 <span class="badge badge-warning badge-pill">{{type.running}}</span>
              </div>
              <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName,'completed')">
                 <div><span class="status-dot bg-success"></span> Completed</div>
                 <span class="badge badge-success badge-pill">{{type.completed}}</span>
              </div>
              <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName,'failed')">
                 <div><span class="status-dot bg-danger"></span> Failed</div>
                 <span class="badge badge-danger badge-pill">{{type.failed}}</span>
              </div>
              <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center px-2 py-1 clickable-row" @click="searchSpecificJob(type.displayName,'repeating')">
                 <div><span class="status-dot bg-secondary"></span> Repeating</div> <!-- Added a neutral color dot -->
                 <span class="badge badge-secondary badge-pill">{{type.repeating}}</span> <!-- Changed badge color -->
              </div>
            </div>
          </div>
        </div>
      </div> <!-- row -->
    </div> <!-- div -->
  `,
});
