const confirmRequeue = Vue.component("confirm-requeue", {
  props: ["job"],
  data: () => ({
    isRequeuing: false, // Add state to track requeue process
  }),
  methods: {
    requeueOne(id) { // Renamed for clarity
      if (!id) {
        console.error("Requeue Error: Job ID is missing.");
        this.$emit("popup-message", "Error: Cannot requeue job without ID.", "danger");
        return;
      }

      this.isRequeuing = true; // Start loading state
      const url = `api/jobs/requeue`;
      let body = { jobIds: [id] };

      axios.post(url, body)
        .then((result) => {
          // Assuming result.data indicates success, e.g., { newJobs: [...] }
          // console.log("Requeue result:", result.data);
          // Emit a more specific success message
          this.$emit("popup-message", "Job successfully requeued!", "success");
          this.$emit("refresh-data");
          // Programmatically close the modal on success
          $('#modalRequeueSure').modal('hide');
        })
        .catch(error => {
          console.error("Error requeueing job:", error);
          const errorMessage = error.response?.data?.message || error.message || "Failed to requeue job.";
          // Emit specific error message
          this.$emit("popup-message", `Error: ${errorMessage}`, "danger");
        })
        .finally(() => {
          this.isRequeuing = false; // End loading state regardless of outcome
        });
    },
    // Reset loading state when modal is hidden
    handleModalClose() {
      // Use a slight delay
      setTimeout(() => {
        this.isRequeuing = false;
      }, 200);
    }
  },
  mounted() {
    // Add event listener for modal close
    $('#modalRequeueSure').on('hidden.bs.modal', this.handleModalClose);
  },
  beforeDestroy() {
    // Clean up listener
    $('#modalRequeueSure').off('hidden.bs.modal', this.handleModalClose);
  },
  template: `
  <div class="modal fade" id="modalRequeueSure" tabindex="-1" role="dialog" aria-labelledby="requeueModalLabel" aria-hidden="true">
    <!-- Modal -->
    <div class="modal-dialog modal-dialog-centered" role="document"> <!-- Added modal-dialog-centered -->
      <div class="modal-content shadow-lg"> <!-- Added shadow -->
        <div class="modal-header bg-primary text-white"> <!-- Primary header for requeue action -->
          <h5 class="modal-title" id="requeueModalLabel">
             <i class="material-icons md-18 align-middle mr-1">update</i> Confirm Job Requeue
          </h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"> <!-- White close button -->
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <!-- Add v-if to prevent errors before job is loaded -->
          <div v-if="job && job.job">
              <p class="lead">Are you sure you want to requeue this job?</p>
              <p class="small text-muted">This will create a new instance of the job ready to be run, ignoring any existing schedule or repeat interval for the new instance.</p>
              <div class="alert alert-secondary small p-2 mt-3"> <!-- Use secondary alert for info -->
                  <strong>Job Name:</strong> {{job.job.name}}<br>
                  <strong>ID:</strong> <code class="text-muted">{{job.job._id}}</code>
              </div>
          </div>
           <div v-else class="text-center text-muted py-3">
              Loading job details...
           </div>
        </div>
        <div class="modal-footer bg-light border-top"> <!-- Consistent light footer -->
          <button type="button" class="btn btn-secondary" data-dismiss="modal" :disabled="isRequeuing">Cancel</button>
          <!-- Removed data-dismiss, added loading state and icon -->
          <button type="button" class="btn btn-primary" @click="requeueOne(job.job._id)" :disabled="isRequeuing || !job || !job.job || !job.job._id">
            <span v-if="isRequeuing" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <i v-else class="material-icons md-18 align-middle mr-1">update</i>
            {{ isRequeuing ? 'Requeuing...' : 'Requeue Job' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  `,
});
