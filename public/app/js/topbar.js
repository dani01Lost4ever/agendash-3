const topbar = Vue.component("topbar", {
  // Props and data remain the same
  props: ["name", "state", "search", "property"],
  data: () => {
    const url = new URL(window.location);
    const limitParam = url.searchParams.get("limit");
    const refreshParam = url.searchParams.get("refresh");

    return {
      limit: limitParam ?? 50, // Default to 50?
      skip: 0, // Skip is usually controlled by pagination, maybe remove from here?
      refresh: refreshParam ?? 0, // Default to 0 (no auto-refresh)
      object: false,
      stateobject: [
        { text: "All Statuses", value: "", class: "" }, // Clearer default text
        { text: "Scheduled", value: "scheduled", class: "text-info" }, // Match badge colors
        { text: "Queued", value: "queued", class: "text-primary" },
        { text: "Running", value: "running", class: "text-warning" },
        { text: "Completed", value: "completed", class: "text-success" },
        { text: "Failed", value: "failed", class: "text-danger" },
        { text: "Repeating", value: "repeating", class: "text-info" }, // Repeating is often info
      ],
      // Use local data properties bound to props for initial values
      // This prevents direct mutation of props
      localName: this.name,
      localState: this.state,
      localSearch: this.search,
      localProperty: this.property,
    }
  },
  watch: {
    // Watch props and update local data if they change externally (e.g., from sidebar click)
    name(newName) { this.localName = newName; },
    state(newState) { this.localState = newState; },
    search(newSearch) { this.localSearch = newSearch; },
    property(newProperty) { this.localProperty = newProperty; },
  },
  methods: {
    submit() {
      // Emit the local data values
      this.$emit(
        "search-form",
        this.localName,
        this.localSearch,
        this.localProperty,
        this.limit,
        0, // Always emit skip 0 when submitting form, pagination handles the rest
        this.refresh,
        this.localState,
        this.object
      );
    },
    clearSearch() {
      this.localName = '';
      this.localState = '';
      this.localSearch = '';
      this.localProperty = '';
      this.object = false;
      // Optionally reset limit/refresh or keep them
      // this.limit = 50;
      // this.refresh = 0;
      this.submit(); // Re-submit with cleared filters
    }
  },
  template: `
  <!-- Wrap in a card for better visual grouping -->
  <div class="card shadow-sm mb-4">
    <div class="card-body p-3">
      <form @submit.prevent="submit">
        <div class="row">
          <!-- Job Filtering Column -->
          <div class="col-lg-6 col-md-12 mb-3 mb-lg-0">
            <h6 class="text-muted mb-2">Filter Jobs</h6>
            <div class="input-group input-group-sm mb-2">
              <div class="input-group-prepend">
                <span class="input-group-text" style="width: 70px;"> Name </span> <!-- Fixed width label -->
              </div>
              <input type="text" class="form-control" placeholder="Job name (exact match or /regex/)" v-model.trim='localName'/>
            </div>
             <div class="input-group input-group-sm mb-2">
              <div class="input-group-prepend">
                <span class="input-group-text" style="width: 70px;"> Status </span>
              </div>
              <select v-model="localState" class="form-control custom-select custom-select-sm"> <!-- Added custom-select -->
                <option v-for="option in stateobject" :key="option.value" :value="option.value" :class="option.class">{{option.text}}</option>
              </select>
            </div>
          </div>

          <!-- Data Filtering Column -->
          <div class="col-lg-6 col-md-12">
             <h6 class="text-muted mb-2">Filter by Data</h6>
             <div class="input-group input-group-sm mb-2">
                <div class="input-group-prepend">
                  <span class="input-group-text" style="width: 70px;"> Property </span>
                </div>
                <!-- Use dot notation for nested properties -->
                <input type="text" class="form-control" placeholder="e.g., user.id or tags" v-model.trim="localProperty" />
             </div>
             <div class="input-group input-group-sm mb-2">
                <div class="input-group-prepend">
                  <span class="input-group-text" style="width: 70px;"> Value </span>
                </div>
                <input class="form-control" v-model.trim="localSearch" placeholder="e.g., 123 or /pattern/i"/>
                <div class="input-group-append">
                    <div class="input-group-text">
                        <div class="form-check form-check-inline m-0" style="min-height: 0;"> <!-- Inline checkbox -->
                            <input type="checkbox" v-model="object" class="form-check-input" id="isObjectId">
                            <label class="form-check-label" for="isObjectId"> Is ObjectId?</label>
                        </div>
                    </div>
                </div>
             </div>
          </div>
        </div>

        <!-- Settings & Actions Row -->
        <hr class="my-2">
        <div class="row align-items-center">
           <div class="col-lg-6 col-md-12 mb-2 mb-lg-0">
                <div class="form-row">
                     <div class="col-auto">
                        <div class="input-group input-group-sm">
                          <div class="input-group-prepend">
                            <span class="input-group-text"> Page Size </span>
                          </div>
                          <input type="number" min="5" max="500" step="5" class="form-control" style="width: 80px;" v-model.number="limit" />
                        </div>
                     </div>
                     <div class="col-auto">
                        <div class="input-group input-group-sm">
                          <div class="input-group-prepend">
                            <span class="input-group-text"> Auto-Refresh (sec) </span>
                          </div>
                          <input type="number" min="0" max="300" step="5" class="form-control" style="width: 80px;" v-model.number="refresh" placeholder="0 = off"/>
                        </div>
                     </div>
                </div>
           </div>
           <div class="col-lg-6 col-md-12 text-right">
                <button type="button" @click="clearSearch" class="btn btn-sm btn-outline-secondary mr-2">
                    <i class="material-icons md-18 align-middle mr-1">clear_all</i> Clear Filters
                </button>
                <button type="submit" class="btn btn-sm btn-primary">
                    <i class="material-icons md-18 align-middle mr-1">search</i> Apply Filters
                </button>
           </div>
        </div>
      </form>
    </div>
  </div>
  `,
});
