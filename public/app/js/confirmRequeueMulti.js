const confirmRequeueMulti = Vue.component("confirm-multi-requeue", {
  props: ["jobs"], // jobs is an array of IDs
  data: () => ({
    isRequeuing: false, // Add state to track requeue process
  }),
  methods: {
    requeueMulti(ids) { // Renamed for consistency
      if (!ids || ids.length === 0) {
        console.error("Requeue Multi Error: No Job IDs provided.");
        this.$emit("popup-message", "Error: No jobs selected for requeue.", "danger");
        return;
      }

      this.isRequeuing = true; // Start loading state
      const url = `api/jobs/requeue`;
      let body = { jobIds: ids };

      axios.post(url, body)
        .then((result) => {
          // Assuming result.data might contain info like { newJobs: [...] }
          // We might not get an exact count back, so use the input count
          const count = ids.length;
          this.$emit("popup-message", `${count} job(s) successfully requeued!`, "success");
          this.$emit("refresh-data");
          // Programmatically close the modal on success
          $('#modalRequeueSureMulti').modal('hide');
          // Optionally clear the parent's selection (using the existing event)
          this.$emit("ready-clean"); // Assuming this event clears the selection in the parent
        })
        .catch(error => {
          console.error("Error requeueing multiple jobs:", error);
          const errorMessage = error.response?.data?.message || error.message || "Failed to requeue jobs.";
          this.$emit("popup-message", `Error: ${errorMessage}`, "danger"); // Show error popup
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
    $('#modalRequeueSureMulti').on('hidden.bs.modal', this.handleModalClose);
  },
  beforeDestroy() {
    // Clean up listener
    $('#modalRequeueSureMulti').off('hidden.bs.modal', this.handleModalClose);
  },
  template: `
  <div class="modal fade" id="modalRequeueSureMulti" tabindex="-1" role="dialog" aria-labelledby="requeueMultiModalLabel" aria-hidden="true">
    <!-- Modal -->
    <div class="modal-dialog modal-dialog-centered" role="document"> <!-- Added modal-dialog-centered -->
      <div class="modal-content shadow-lg"> <!-- Added shadow -->
        <div class="modal-header bg-primary text-white"> <!-- Primary header for requeue action -->
          <h5 class="modal-title" id="requeueMultiModalLabel">
             <i class="material-icons md-18 align-middle mr-1">update</i> Confirm Bulk Requeue
          </h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"> <!-- White close button -->
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <!-- Add v-if to prevent errors before jobs array is ready -->
          <div v-if="jobs && jobs.length > 0">
              <p class="lead">Are you sure you want to requeue the selected <strong>{{ jobs.length }}</strong> job(s)?</p>
              <p class="small text-muted">This will create new instances for each selected job, ready to be run.</p>
              <!-- Optional: List IDs -->
              <!--
              <p class="small text-muted mb-1">Selected Job IDs:</p>
              <div class="border rounded p-2 bg-light" style="max-height: 100px; overflow-y: auto; font-size: 0.8rem;">
                  <div v-for="jobId in jobs" :key="jobId"><code>{{ jobId }}</code></div>
              </div>
              -->
          </div>
           <div v-else class="text-center text-muted py-3">
              No jobs selected for requeue.
           </div>
        </div>
        <div class="modal-footer bg-light border-top"> <!-- Consistent light footer -->
          <button type="button" class="btn btn-secondary" data-dismiss="modal" :disabled="isRequeuing">Cancel</button>
          <!-- Removed data-dismiss, added loading state and icon -->
          <button type="button" class="btn btn-primary" @click="requeueMulti(jobs)" :disabled="isRequeuing || !jobs || jobs.length === 0">
            <span v-if="isRequeuing" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <i v-else class="material-icons md-18 align-middle mr-1">update</i>
            {{ isRequeuing ? 'Requeuing...' : 'Requeue Selected (' + (jobs ? jobs.length : 0) + ')' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  `,
});
