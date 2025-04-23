const confirmDeleteMulti = Vue.component("confirm-multi-delete", {
  props: ["jobs"], // jobs is an array of IDs
  data: () => ({
    isDeleting: false, // Add state to track deletion process
  }),
  methods: {
    deleteMulti(ids) {
      if (!ids || ids.length === 0) {
        console.error("Delete Multi Error: No Job IDs provided.");
        this.$emit("popup-message", "Error: No jobs selected for deletion.", "danger");
        return;
      }

      this.isDeleting = true; // Start loading state
      const url = `api/jobs/delete`;
      let body = { jobIds: ids };

      axios.post(url, body)
        .then((result) => {
          // Assuming result.data might contain info like { deletedCount: X }
          const count = result.data?.deletedCount ?? ids.length; // Use actual count if available, else fallback
          this.$emit("popup-message", `${count} job(s) deleted successfully!`, "success");
          this.$emit("refresh-data");
          // Programmatically close the modal on success
          $('#modalDeleteSureMulti').modal('hide');
          // Optionally clear the parent's selection if needed (might require another event)
          // this.$emit('clear-selection');
        })
        .catch(error => {
          console.error("Error deleting multiple jobs:", error);
          const errorMessage = error.response?.data?.message || error.message || "Failed to delete jobs.";
          this.$emit("popup-message", `Error: ${errorMessage}`, "danger"); // Show error popup
        })
        .finally(() => {
          this.isDeleting = false; // End loading state regardless of outcome
        });
    },
    // Reset loading state when modal is hidden
    handleModalClose() {
      // Use a slight delay
      setTimeout(() => {
        this.isDeleting = false;
      }, 200);
    }
  },
  mounted() {
    // Add event listener for modal close
    $('#modalDeleteSureMulti').on('hidden.bs.modal', this.handleModalClose);
  },
  beforeDestroy() {
    // Clean up listener
    $('#modalDeleteSureMulti').off('hidden.bs.modal', this.handleModalClose);
  },
  template: `
  <div class="modal fade" id="modalDeleteSureMulti" tabindex="-1" role="dialog" aria-labelledby="deleteMultiModalLabel" aria-hidden="true">
    <!-- Modal -->
    <div class="modal-dialog modal-dialog-centered" role="document"> <!-- Added modal-dialog-centered -->
      <div class="modal-content shadow-lg"> <!-- Added shadow -->
        <div class="modal-header bg-danger text-white"> <!-- Danger header for emphasis -->
          <h5 class="modal-title" id="deleteMultiModalLabel">
             <i class="material-icons md-18 align-middle mr-1">warning</i> Confirm Bulk Deletion
          </h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"> <!-- White close button -->
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <!-- Add v-if to prevent errors before jobs array is ready -->
          <div v-if="jobs && jobs.length > 0">
              <p class="lead">Are you absolutely sure you want to permanently delete the selected <strong>{{ jobs.length }}</strong> job(s)?</p>
              <!-- Optional: List IDs in a scrollable box if needed -->
              <!--
              <p class="small text-muted mb-1">Selected Job IDs:</p>
              <div class="border rounded p-2 bg-light" style="max-height: 100px; overflow-y: auto; font-size: 0.8rem;">
                  <div v-for="jobId in jobs" :key="jobId"><code>{{ jobId }}</code></div>
              </div>
              -->
              <p class="text-danger mt-3"><strong>This action cannot be undone.</strong></p>
          </div>
           <div v-else class="text-center text-muted py-3">
              No jobs selected for deletion.
           </div>
        </div>
        <div class="modal-footer bg-light border-top"> <!-- Consistent light footer -->
          <button type="button" class="btn btn-secondary" data-dismiss="modal" :disabled="isDeleting">Cancel</button>
          <!-- Removed data-dismiss, added loading state and icon -->
          <button type="button" class="btn btn-danger" @click="deleteMulti(jobs)" :disabled="isDeleting || !jobs || jobs.length === 0">
            <span v-if="isDeleting" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <i v-else class="material-icons md-18 align-middle mr-1">delete_sweep</i>
            {{ isDeleting ? 'Deleting...' : 'Delete Selected (' + (jobs ? jobs.length : 0) + ')' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  `,
});
