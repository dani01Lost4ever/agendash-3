const newJob = Vue.component("new-job", {
  data: () => ({
    jobDataParseError: "",
    jobName: "",
    jobSchedule: "", // e.g., "in 5 minutes", "tomorrow at noon"
    jobRepeatEvery: "", // e.g., "1 day", "2 hours"
    // Provide a more minimal default JSON example
    jobData: `{
  "exampleKey": "exampleValue"
}`,
    isCreating: false, // Add loading state for button
  }),
  // Removed props: ["job"] as it wasn't used
  methods: {
    clear() {
      this.jobDataParseError = "";
      this.jobName = "";
      this.jobSchedule = "";
      this.jobRepeatEvery = "";
      this.jobData = `{
  "exampleKey": "exampleValue"
}`;
      this.isCreating = false;
    },
    validateAndParseData() {
      this.jobDataParseError = ""; // Clear previous error
      if (!this.jobData || this.jobData.trim() === '') {
        return {}; // Allow empty data
      }
      try {
        const parsedData = JSON.parse(this.jobData);
        // Basic validation: ensure it's an object
        if (typeof parsedData !== 'object' || parsedData === null || Array.isArray(parsedData)) {
          throw new Error("Job data must be a JSON object (e.g., {}).");
        }
        return parsedData;
      } catch (err) {
        this.jobDataParseError = `Invalid JSON: ${err.message}`;
        return null; // Indicate parsing failure
      }
    },
    create() {
      // Basic validation
      if (!this.jobName.trim()) {
        // Maybe add visual feedback later
        alert("Job Name is required.");
        return;
      }
      if (!this.jobSchedule.trim() && !this.jobRepeatEvery.trim()) {
        alert("Either Job Schedule (for one-time) or Job Repeat Every (for repeating) must be provided.");
        return;
      }
      if (this.jobSchedule.trim() && this.jobRepeatEvery.trim()) {
        alert("Provide either Job Schedule OR Job Repeat Every, not both.");
        return;
      }

      const parsedJobData = this.validateAndParseData();
      if (parsedJobData === null) {
        // Error already set, just stop
        return;
      }

      this.isCreating = true; // Set loading state
      const url = `api/jobs/create`;

      let body = {
        jobName: this.jobName.trim(),
        jobSchedule: this.jobSchedule.trim(),
        jobRepeatEvery: this.jobRepeatEvery.trim(),
        jobData: parsedJobData,
      };

      axios.post(url, body)
        .then((result) => {
          // Check result status if needed: result.status === 200
          this.$emit("popup-message", "Job created successfully!", "success"); // Pass type
          this.$emit("refresh-data");
          // Use jQuery to close modal if Bootstrap's JS is loaded globally
          $('#modalNewJob').modal('hide');
          this.clear(); // Clear form after successful creation
        })
        .catch(error => {
          console.error("Error creating job:", error);
          const errorMessage = error.response?.data?.message || error.message || "Failed to create job.";
          this.$emit("popup-message", `Error: ${errorMessage}`, "danger"); // Show error popup
        })
        .finally(() => {
          this.isCreating = false; // Reset loading state
        });
    },
    // Call clear when the modal is hidden (using Bootstrap events)
    handleModalClose() {
      // Use a slight delay to ensure modal is fully hidden before clearing
      setTimeout(() => {
        this.clear();
      }, 200); // Adjust delay if needed
    }
  },
  mounted() {
    // Add event listener for modal close
    $('#modalNewJob').on('hidden.bs.modal', this.handleModalClose);
  },
  beforeDestroy() {
    // Clean up listener
    $('#modalNewJob').off('hidden.bs.modal', this.handleModalClose);
  },
  template: `
  <div class="modal fade" id="modalNewJob" tabindex="-1" role="dialog" aria-labelledby="newJobModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg" role="document"> <!-- Use modal-lg -->
      <div class="modal-content shadow-lg">
        <div class="modal-header bg-light border-bottom">
          <h5 class="modal-title" id="newJobModalLabel">Create New Job</h5>
          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body p-4"> <!-- Added padding -->
            <form @submit.prevent="create"> <!-- Allow enter key submission -->
              <div class="form-group">
                <label for="jobNameInput">Job Name <span class="text-danger">*</span></label>
                <input v-model.trim="jobName" type="text" class="form-control" id="jobNameInput" placeholder="e.g., Send Welcome Email" required>
              </div>

              <p class="text-muted small mb-2">Define when the job runs (provide only one):</p>
              <div class="row">
                  <div class="col-md-6">
                      <div class="form-group">
                        <label for="jobScheduleInput">Run Once At (Schedule)</label>
                        <input v-model.trim="jobSchedule" type="text" class="form-control" id="jobScheduleInput" placeholder="e.g., in 5 minutes, tomorrow at 9am">
                        <small class="form-text text-muted">Uses <a href="https://github.com/MatthewMueller/date" target="_blank">date.js</a> (e.g., "tomorrow at noon", "in 1 hour"). Leave blank if repeating.</small>
                      </div>
                  </div>
                   <div class="col-md-6">
                      <div class="form-group">
                        <label for="jobRepeatInput">Repeat Every</label>
                        <input v-model.trim="jobRepeatEvery" type="text" class="form-control" id="jobRepeatInput" placeholder="e.g., 1 day, 2 hours">
                        <small class="form-text text-muted">Uses <a href="https://github.com/jkroso/human-interval" target="_blank">human-interval</a> (e.g., "3 hours", "1 week"). Leave blank if running once.</small>
                      </div>
                  </div>
              </div>

              <div class="form-group">
                <label for="jobDataInput">Job Data (Metadata - JSON Object)</label>
                <!-- Added is-invalid class binding -->
                <prism-editor class="json-editor border rounded" :class="{'is-invalid': jobDataParseError}" style="min-height: 150px; max-height: 250px;" :lineNumbers="true" v-model="jobData" language="json" id="jobDataInput"></prism-editor>
                <!-- Display parsing error -->
                <div v-if="jobDataParseError" class="invalid-feedback d-block">
                    {{ jobDataParseError }}
                </div>
                 <small v-else class="form-text text-muted">Enter job-specific data as a valid JSON object {}.</small>
              </div>
              <!-- Hidden submit button for form submission on enter -->
              <button type="submit" style="display: none;"></button>
            </form>
        </div>
        <div class="modal-footer bg-light border-top">
          <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-primary" @click="create()" :disabled="isCreating">
            <span v-if="isCreating" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <i v-else class="material-icons md-18 align-middle mr-1">save</i>
            {{ isCreating ? 'Creating...' : 'Create Job' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  `,
});
