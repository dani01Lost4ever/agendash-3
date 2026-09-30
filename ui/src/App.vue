<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { api, ApiError, errorMessage, type JobEntry, type OverviewEntry, type SortDirection, type SortField } from './api';
import { ACTIONS, performAction, type JobAction } from './actions';
import { logout, session, setReadOnly } from './auth';
import AppIcon from './components/AppIcon.vue';
import AppNavbar from './components/AppNavbar.vue';
import ConfirmAction from './components/ConfirmAction.vue';
import FilterBar from './components/FilterBar.vue';
import JobDetail from './components/JobDetail.vue';
import JobList from './components/JobList.vue';
import JobTypeNav from './components/JobTypeNav.vue';
import LoginDialog from './components/LoginDialog.vue';
import NewJob from './components/NewJob.vue';
import StatusCards from './components/StatusCards.vue';
import ToastStack from './components/ToastStack.vue';
import { useToasts } from './composables/useToasts';
import { DEFAULT_VIEW, readViewFromUrl, writeViewToUrl, type Filters } from './filters';
import { nameSearchQuery } from './jobs';

const { notify } = useToasts();

// View state, kept in the URL so reloads and shared links show the same jobs
const initialView = readViewFromUrl();
const filters = reactive<Filters>({ ...initialView.filters });
const page = ref(initialView.page);
const pageSize = ref(initialView.pageSize);
const sortBy = ref<SortField | ''>(initialView.sortBy);
const sortDir = ref<SortDirection>(initialView.sortDir);
const refreshSeconds = ref(initialView.refreshSeconds);
const openJobId = ref(initialView.jobId);

// Data from the API
const jobs = ref<JobEntry[]>([]);
const overview = ref<OverviewEntry[]>([]);
const totalJobs = ref(0);
const totalPages = ref(1);
const loading = ref(false);
const loadError = ref('');
const lastUpdated = ref<number | null>(null);
const selected = ref<string[]>([]);

const jobTypeNav = ref<InstanceType<typeof JobTypeNav> | null>(null);
const jobDetail = ref<InstanceType<typeof JobDetail> | null>(null);
const confirmAction = ref<InstanceType<typeof ConfirmAction> | null>(null);
const newJob = ref<InstanceType<typeof NewJob> | null>(null);

const types = computed(() => overview.value.slice(1));
const totals = computed<OverviewEntry | undefined>(() => overview.value[0]);
const jobNames = computed(() => types.value.map((type) => type.displayName));
const dataFilterActive = computed(() => Boolean(filters.property && filters.q));
const filtered = computed(() => Boolean(filters.job || filters.search || filters.state || dataFilterActive.value));

/** Search text as the pattern the server matches, to count matching job types here too. */
const searchPattern = computed(() => {
  const query = nameSearchQuery(filters.search);
  if (!query) return null;
  try {
    return new RegExp(query.slice(1, -1), 'i');
  } catch {
    return null;
  }
});

// State counts for the job type or search in view, so the cards match the list
const counts = computed<OverviewEntry | undefined>(() => {
  if (filters.job) return types.value.find((type) => type.displayName === filters.job);
  const pattern = searchPattern.value;
  if (!pattern || !totals.value) return totals.value;
  const matching = types.value.filter((type) => pattern.test(type.displayName));
  const sum = { ...totals.value, displayName: filters.search };
  for (const key of Object.keys(sum) as Array<keyof OverviewEntry>) {
    if (key !== 'displayName') sum[key] = matching.reduce((total, type) => total + (type[key] || 0), 0);
  }
  return sum;
});

const heading = computed(() => {
  if (filters.job) return { eyebrow: 'Job type', title: filters.job };
  if (filters.search) return { eyebrow: 'Search', title: `“${filters.search}”` };
  return { eyebrow: 'Overview', title: 'All jobs' };
});

let requestId = 0;

async function load() {
  const id = ++requestId;
  loading.value = true;
  try {
    const data = await api.getJobs({
      job: filters.job || nameSearchQuery(filters.search),
      state: filters.state,
      property: dataFilterActive.value ? filters.property : '',
      q: dataFilterActive.value ? filters.q : '',
      isObjectId: dataFilterActive.value && filters.isObjectId,
      limit: pageSize.value,
      skip: (page.value - 1) * pageSize.value,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
    });
    // A newer request was sent meanwhile: its answer wins
    if (id !== requestId) return;

    jobs.value = data.jobs;
    overview.value = data.overview;
    totalJobs.value = data.totalJobs;
    totalPages.value = Math.max(1, data.totalPages);
    loadError.value = '';
    lastUpdated.value = Date.now();
    const listed = new Set(data.jobs.map((job) => job.job._id));
    selected.value = selected.value.filter((jobId) => listed.has(jobId));
    // Jobs were removed and the page is now past the end
    if (page.value > totalPages.value) page.value = totalPages.value;
  } catch (error) {
    if (id !== requestId) return;
    loadError.value = errorMessage(error, 'Could not load the jobs.');
  } finally {
    if (id === requestId) loading.value = false;
  }
}

// Any change to the query starts again from the first page. This watcher is declared before
// the one below, so both run in the same flush and the jobs load once.
const queryKey = computed(() => JSON.stringify([filters, sortBy.value, sortDir.value, pageSize.value]));
watch(queryKey, () => {
  page.value = 1;
  selected.value = [];
});
watch([queryKey, page], () => void load());

watch(
  () => ({
    filters: { ...filters },
    page: page.value,
    pageSize: pageSize.value,
    sortBy: sortBy.value,
    sortDir: sortDir.value,
    refreshSeconds: refreshSeconds.value,
    jobId: openJobId.value,
  }),
  writeViewToUrl,
  { deep: true },
);

// Auto-refresh, paused while the tab is hidden
let refreshTimer: ReturnType<typeof setInterval> | undefined;
watch(
  refreshSeconds,
  (seconds) => {
    clearInterval(refreshTimer);
    if (seconds > 0) {
      refreshTimer = setInterval(() => {
        if (!document.hidden && !loading.value) void load();
      }, seconds * 1000);
    }
  },
  { immediate: true },
);

function onVisibilityChange() {
  if (!document.hidden && refreshSeconds.value > 0) void load();
}
document.addEventListener('visibilitychange', onVisibilityChange);
onBeforeUnmount(() => {
  clearInterval(refreshTimer);
  document.removeEventListener('visibilitychange', onVisibilityChange);
});

function updateFilters(changes: Partial<Filters>) {
  Object.assign(filters, changes);
}

function clearFilters() {
  Object.assign(filters, DEFAULT_VIEW.filters);
}

function selectJobType(name: string) {
  updateFilters({ job: name, search: '' });
}

function sort(field: SortField | '', direction: SortDirection) {
  sortBy.value = field;
  sortDir.value = direction;
}

// Job details
const detailJob = ref<JobEntry | null>(null);

async function openJob(job: JobEntry) {
  detailJob.value = job;
  openJobId.value = job.job._id;
  await nextTick();
  jobDetail.value?.open();
}

async function openJobFromUrl(jobId: string) {
  try {
    await openJob(await api.getJob(jobId));
  } catch (error) {
    openJobId.value = '';
    const notFound = error instanceof ApiError && (error.status === 404 || error.status === 400);
    notify(notFound ? 'The job in the link no longer exists.' : errorMessage(error, 'Could not load the job.'), 'warning');
  }
}

function onDetailClosed() {
  openJobId.value = '';
}

// Actions on jobs
const pendingAction = ref<JobAction | null>(null);
const pendingJobs = ref<JobEntry[]>([]);
const busy = ref(false);

/** Runs `action`, reports the outcome and reloads. Resolves to whether the request succeeded. */
async function runAction(action: JobAction, targets: JobEntry[]): Promise<boolean> {
  const ids = targets.map((job) => job.job._id);
  busy.value = true;
  let succeeded = false;
  try {
    const { message, tone } = await performAction(action, ids);
    notify(message, tone);
    selected.value = selected.value.filter((jobId) => !ids.includes(jobId));
    succeeded = true;
  } catch (error) {
    notify(errorMessage(error, `${ACTIONS[action].label} failed.`), 'danger');
  } finally {
    busy.value = false;
  }
  await load();
  return succeeded;
}

/** From the list: asks first when the action needs it. */
function requestAction(action: JobAction, targets: JobEntry[]) {
  if (targets.length === 0) return;
  if (!ACTIONS[action].confirm) {
    void runAction(action, targets);
    return;
  }
  pendingAction.value = action;
  pendingJobs.value = targets;
  confirmAction.value?.open();
}

async function confirmPending() {
  if (!pendingAction.value) return;
  await runAction(pendingAction.value, pendingJobs.value);
  confirmAction.value?.hide();
}

/** From the job details, which ask for confirmation themselves. */
async function detailAction(action: JobAction, job: JobEntry) {
  const succeeded = await runAction(action, [job]);
  if (succeeded && action === 'delete') jobDetail.value?.hide();
}

function onJobCreated(name: string) {
  notify(`Job “${name}” created`, 'success');
  void load();
}

// Read-only mode can depend on who is signed in, so it is read again after every login
watch(
  () => session.version,
  () => {
    api.getConfig().then(
      (config) => setReadOnly(config.readOnly),
      (error: unknown) => console.error('Error loading the dashboard config:', error),
    );
  },
  { immediate: true },
);

void load();
if (openJobId.value) void openJobFromUrl(openJobId.value);
</script>

<template>
  <div class="app-shell">
    <AppNavbar
      v-model:refresh-seconds="refreshSeconds"
      :loading="loading"
      :last-updated="lastUpdated"
      @refresh="load"
      @new-job="newJob?.open()"
      @toggle-sidebar="jobTypeNav?.toggle()"
    >
      <button v-if="session.signedIn" type="button" class="btn btn-sm btn-outline-secondary" @click="logout()">Sign out</button>
    </AppNavbar>

    <div class="app-body">
      <JobTypeNav
        ref="jobTypeNav"
        :types="types"
        :total="totals?.total ?? 0"
        :selected="filters.job"
        :loading="loading"
        @select="selectJobType"
      />

      <main class="app-main">
        <div class="app-main-inner">
          <header class="page-header">
            <div class="min-w-0">
              <div class="page-eyebrow">{{ heading.eyebrow }}</div>
              <h1 class="page-title text-break">{{ heading.title }}</h1>
            </div>
            <button v-if="filters.job || filters.search" type="button" class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" @click="selectJobType('')">
              <AppIcon name="close" /> Show all jobs
            </button>
          </header>

          <div v-if="loadError" class="alert alert-danger d-flex align-items-center gap-2 py-2" role="alert">
            <AppIcon name="cloud_off" />
            <span class="flex-grow-1">{{ loadError }}</span>
            <button type="button" class="btn btn-sm btn-outline-danger" :disabled="loading" @click="load">Retry</button>
          </div>

          <StatusCards :counts="counts" :active="filters.state" @select="(state) => updateFilters({ state })" />

          <FilterBar :filters="filters" @update="updateFilters" @clear="clearFilters" />

          <JobList
            v-model:selected="selected"
            :jobs="jobs"
            :loading="loading && lastUpdated === null"
            :sort-by="sortBy"
            :sort-dir="sortDir"
            :page="page"
            :page-size="pageSize"
            :total-jobs="totalJobs"
            :total-pages="totalPages"
            :filtered="filtered"
            @sort="sort"
            @page="(value) => (page = value)"
            @page-size="(value) => (pageSize = value)"
            @open="openJob"
            @action="requestAction"
            @clear-filters="clearFilters"
          />
        </div>

        <footer class="app-footer">
          UI written by <a href="https://www.softwareontheroad.com/about" target="_blank" rel="noopener noreferrer">Sam Quinn</a>.
          Backend by the Agenda team. Modified by Daniel Busetto.
        </footer>
      </main>
    </div>

    <JobDetail ref="jobDetail" :listed-job="detailJob" :refresh-key="lastUpdated" :busy="busy" @action="detailAction" @closed="onDetailClosed" />
    <ConfirmAction ref="confirmAction" :action="pendingAction" :jobs="pendingJobs" :busy="busy" @confirm="confirmPending" />
    <NewJob ref="newJob" :names="jobNames" @created="onJobCreated" />
    <ToastStack />
    <LoginDialog />
  </div>
</template>
