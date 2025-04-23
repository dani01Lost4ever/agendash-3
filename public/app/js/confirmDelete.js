const confirmDelete = Vue.component("confirm-delete", {
  props: ["job"],
  data: () => ({
    isDeleting: false, // Add state to track deletion process
  }),
  methods: {
    deleteOne(id) {
      if (!id) {
        console.error("Delete Error: Job ID is missing.");
        this.$emit("popup-message", "Error: Cannot delete job without ID.", "danger");
        return;
      }

      this.isDeleting = true; // Start loading state
      const url = `api/jobs/delete`;
      let body = { jobIds: [id] };

      axios.post(url, body)
        .then((result) => {
          // Assuming result.data contains info about deleted count, etc.
          // console.log("Delete result:", result.data);
          this.$emit("popup-message", "Job deleted successfully!", "success"); // Use consistent message format
          this.$emit("refresh-data");
          // Programmatically close the modal on success
          $('#modalDeleteSure').modal('hide');
        })
        .catch(error => {
          console.error("Error deleting job:", error);
          const errorMessage = error.response?.data?.message || error.message || "Failed to delete job.";
          this.$emit("popup-message", `Error: ${errorMessage}`, "danger"); // Show error popup
        })
        .finally(() => {
          this.isDeleting = false; // End loading state regardless of outcome
        });
    },
    // Reset loading state when modal is hidden (e.g., by clicking cancel or backdrop)
    handleModalClose() {
      // Use a slight delay to ensure modal is fully hidden before resetting
      setTimeout(() => {
        this.isDeleting = false;
      }, 200);
    }
  },
  mounted() {
    // Add event listener for modal close
    $('#modalDeleteSure').on('hidden.bs.modal', this.handleModalClose);
  },
  beforeDestroy() {
    // Clean up listener
    $('#modalDeleteSure').off('hidden.bs.modal', this.handleModalClose);
  },
  template: `
  <div class="modal fade" id="modalDeleteSure" tabindex="-1" role="dialog" aria-labelledby="deleteModalLabel" aria-hidden="true">
    <!-- Modal -->
    <div class="modal-dialog modal-dialog-centered" role="document"> <!-- Added modal-dialog-centered -->
      <div class="modal-content shadow-lg"> <!-- Added shadow -->
        <div class="modal-header bg-danger text-white"> <!-- Danger header for emphasis -->
          <h5 class="modal-title" id="deleteModalLabel">
             <i class="material-icons md-18 align-middle mr-1">warning</i> Confirm Permanent Deletion
          </h5>
          <button type="button" class="close text-white" data-dismiss="modal" aria-label="Close"> <!-- White close button -->
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <!-- Add v-if to prevent errors before job is loaded -->
          <div v-if="job && job.job">
              <p class="lead">Are you absolutely sure you want to permanently delete this job?</p>
              <div class="alert alert-warning small p-2"> <!-- Warning box -->
                  <strong>Job Name:</strong> {{job.job.name}}<br>
                  <strong>ID:</strong> <code class="text-muted">{{job.job._id}}</code>
              </div>
              <p class="text-danger"><strong>This action cannot be undone.</strong></p>
          </div>
           <div v-else class="text-center text-muted py-3">
              Loading job details...
           </div>
        </div>
        <div class="modal-footer bg-light border-top"> <!-- Consistent light footer -->
          <button type="button" class="btn btn-secondary" data-dismiss="modal" :disabled="isDeleting">Cancel</button>
          <!-- Removed data-dismiss, added loading state and icon -->
          <button type="button" class="btn btn-danger" @click="deleteOne(job.job._id)" :disabled="isDeleting || !job || !job.job || !job.job._id">
            <span v-if="isDeleting" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <i v-else class="material-icons md-18 align-middle mr-1">delete_forever</i>
            {{ isDeleting ? 'Deleting...' : 'Delete Permanently' }}
          </button>
        </div>
      </div>
    </div>
  </div>
  `,
});
