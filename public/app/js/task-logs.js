Vue.component('task-logs', {
  props: ['jobId'],
  data: () => ({
    logs: [],
    loading: false
  }),
  methods: {
    fetchLogs() {
      this.loading = true;
      axios.get(`api/jobs/${this.jobId}/logs`)
        .then(response => {
          this.logs = response.data;
        })
        .finally(() => {
          this.loading = false;
        });
    }
  },
  created() {
    this.fetchLogs();
  },
  template: `
    <div class="task-logs p-3">
      <h5>Task Execution Log</h5>
      <div v-if="loading" class="text-center">
        <div class="spinner-border" role="status">
          <span class="sr-only"></span>
        </div>
      </div>
      <div v-else class="log-list">
        <div v-for="log in logs" :key="log._id"
             :class="['log-entry p-2 mb-2 rounded', {
               'bg-success text-white': log.status === 'completed',
               'bg-danger text-white': log.status === 'failed',
               'bg-info text-white': log.status === 'started'
             }]">
          <div class="d-flex justify-content-between">
            <strong>{{log.status.toUpperCase()}}</strong>
            <small>{{new Date(log.timestamp).toLocaleString()}}</small>
          </div>
          <div>{{log.message}}</div>
        </div>
      </div>
    </div>
  `
});
