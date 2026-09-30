<script setup lang="ts">
import { ref } from 'vue';

import { api, type JobEntry, type OverviewEntry } from './api';
import ConfirmDelete from './components/ConfirmDelete.vue';
import ConfirmDeleteMulti from './components/ConfirmDeleteMulti.vue';
import ConfirmRequeue from './components/ConfirmRequeue.vue';
import ConfirmRequeueMulti from './components/ConfirmRequeueMulti.vue';
import JobDetail from './components/JobDetail.vue';
import JobList from './components/JobList.vue';
import NewJob from './components/NewJob.vue';
import PopupMessage from './components/PopupMessage.vue';
import SideBar from './components/SideBar.vue';
import TopBar from './components/TopBar.vue';

type PopupKind = 'delete' | 'multidelete' | 'requeue' | 'multirequeue' | 'create';

const initialUrl = new URL(window.location.href);

const jobs = ref<JobEntry[]>([]);
const overview = ref<OverviewEntry[]>([]);
const refresh = ref(30);
const pagenumber = ref(1);
const totalPages = ref(0);
const jobData = ref<JobEntry | null>(null);
const selectedJobIds = ref<string[]>([]);
const deletec = ref(false);
const requeuec = ref(false);
const createc = ref(false);
const pagesize = ref(50);
const property = ref('');
const search = ref('');
const object = ref(false);
const skip = ref(0);
const name = ref('');
const state = ref(initialUrl.searchParams.get('jobType') ?? '');
const loading = ref(false);
const hideSlide = ref(true);

const jobDetail = ref<InstanceType<typeof JobDetail> | null>(null);
const confirmDeleteModal = ref<InstanceType<typeof ConfirmDelete> | null>(null);
const confirmDeleteMultiModal = ref<InstanceType<typeof ConfirmDeleteMulti> | null>(null);
const confirmRequeueModal = ref<InstanceType<typeof ConfirmRequeue> | null>(null);
const confirmRequeueMultiModal = ref<InstanceType<typeof ConfirmRequeueMulti> | null>(null);
const newJobModal = ref<InstanceType<typeof NewJob> | null>(null);

const sidebar = ref<HTMLElement | null>(null);
const sidebarButton = ref<HTMLElement | null>(null);

function openNav() {
  if (sidebar.value) sidebar.value.style.width = '100%';
  if (sidebarButton.value) sidebarButton.value.style.marginLeft = '100%';
  hideSlide.value = false;
}

function closeNav() {
  if (sidebar.value) sidebar.value.style.width = '0';
  if (sidebarButton.value) sidebarButton.value.style.marginLeft = '0';
  hideSlide.value = true;
}

function showJobDetail(job: JobEntry) {
  jobData.value = job;
  jobDetail.value?.open();
}

function confirmDelete(job: JobEntry) {
  jobData.value = job;
  confirmDeleteModal.value?.open();
}

function confirmDeleteMulti(jobIds: string[]) {
  selectedJobIds.value = jobIds;
  confirmDeleteMultiModal.value?.open();
}

function confirmRequeue(job: JobEntry) {
  jobData.value = job;
  confirmRequeueModal.value?.open();
}

function confirmRequeueMulti(jobIds: string[]) {
  selectedJobIds.value = jobIds;
  confirmRequeueMultiModal.value?.open();
}

function newJob() {
  newJobModal.value?.open();
}

function searchForm(
  newName: string,
  newSearch: string,
  newProperty: string,
  limit: number | string,
  newSkip: number | string,
  newRefresh: number | string,
  newState: string,
  newObject: boolean | string,
) {
  const url = new URL(window.location.href);
  url.searchParams.set('limit', String(limit));
  window.history.replaceState({}, '', url);

  pagesize.value = limit ? Number(limit) : pagesize.value;
  name.value = newName;
  search.value = newSearch;
  property.value = newProperty;
  skip.value = Number(newSkip) || 0;
  refresh.value = Number.parseFloat(String(newRefresh));
  state.value = newState;
  object.value = newObject ? Boolean(newObject) : object.value;

  // Form changed, reset the pagination state
  pagenumber.value = 1;
  totalPages.value = 1;

  void fetchData(name.value, search.value, property.value, pagesize.value, skip.value, refresh.value, state.value, object.value);
}

function refreshData() {
  void fetchData(name.value, search.value, property.value, pagesize.value, skip.value, refresh.value, state.value, object.value);
}

function pagechange(action: 'next' | 'prev') {
  if (action === 'next') {
    pagenumber.value++;
  }
  if (action === 'prev') {
    pagenumber.value--;
  }
  skip.value = (pagenumber.value - 1) * pagesize.value;
  void fetchData(name.value, search.value, property.value, pagesize.value, skip.value, refresh.value, state.value, object.value);
}

async function fetchData(
  newName = '',
  newSearch = '',
  newProperty = '',
  limit: number | string = 50,
  newSkip: number | string = 0,
  newRefresh: number | string = 30,
  newState = '',
  newObject = false,
) {
  loading.value = true;
  pagesize.value = pagesize.value === 0 ? Number.parseInt(String(limit), 10) : pagesize.value;
  refresh.value = Number.parseFloat(String(newRefresh));
  try {
    const data = await api.getJobs({
      limit,
      job: newName,
      skip: newSkip,
      property: newProperty,
      isObjectId: newObject,
      state: newState,
      q: newSearch,
    });
    jobs.value = data.jobs;
    search.value = newSearch;
    property.value = newProperty;
    object.value = newObject;
    overview.value = data.overview;
    totalPages.value = data.totalPages;
  } catch (error) {
    console.log(error);
    jobs.value = [];
  } finally {
    loading.value = false;
  }
}

function popupmessage(kind: PopupKind) {
  const flag = kind === 'create' ? createc : kind === 'delete' || kind === 'multidelete' ? deletec : requeuec;
  flag.value = true;
  setTimeout(() => {
    flag.value = false;
  }, 2000);
}

void fetchData();
</script>

<template>
  <div class="container-fluid">
    <div class="">
      <div class="navbar navbar-dark fixed-top licensesync-color flex-md-nowrap p-0 shadow">
        <div class="d-flex">
          <div>
            <a class="navbar-brand col-sm-10 col-md-10 me-0 tittle"> Agendash 3</a>
          </div>
          <div class="d-md-none w-50">
            <div id="mySidebar" ref="sidebar" class="sidebar-collapse" @click="closeNav()">
              <a href="#" class="closebtn" @click.prevent="closeNav()">&times;</a>
              <div v-if="hideSlide === false" class="bg-light overflow-auto">
                <SideBar
                  :overview="overview"
                  :pagesize="pagesize"
                  :loading="loading"
                  @search-sidebar="searchForm"
                  @new-job="newJob"
                />
              </div>
            </div>
            <div id="main" ref="sidebarButton" class="slidebar-container-button">
              <button class="openbtn" @click="openNav()">&#9776;</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="row pt-5">
      <div v-if="hideSlide === true" class="col-md-2 d-none d-md-block bg-light overflow-auto">
        <SideBar
          :overview="overview"
          :pagesize="pagesize"
          :loading="loading"
          @search-sidebar="searchForm"
          @new-job="newJob"
        />
      </div>
      <main role="main" class="col-md-10 ms-sm-auto col-lg-10 px-4 pt-3 pb-5">
        <div class="col-12">
          <TopBar
            :name="name"
            :state="state"
            :search="search"
            :property="property"
            @search-form="searchForm"
          />
        </div>
        <div class="col-12">
          <JobList
            :pagesize="pagesize"
            :pagenumber="pagenumber"
            :total-pages="totalPages"
            :jobs="jobs"
            :loading="loading"
            @confirm-delete="confirmDelete"
            @confirm-multi-delete="confirmDeleteMulti"
            @confirm-requeue="confirmRequeue"
            @confirm-multi-requeue="confirmRequeueMulti"
            @show-job-detail="showJobDetail"
            @pagechange="pagechange"
          />
        </div>
      </main>
    </div>
    <div class="row licensesync-color py-3">
      <div class="col-6 m-auto text-light text-center">
        <small>UI written by <a class="text-light" href="https://www.softwareontheroad.com/about" target="_BLANK">Sam Quinn</a>. Backend by Agenda team. Modified by Daniel Busetto</small>
      </div>
    </div>
    <JobDetail ref="jobDetail" :job="jobData" />
    <ConfirmDelete ref="confirmDeleteModal" :job="jobData" @popup-message="popupmessage('delete')" @refresh-data="refreshData" />
    <ConfirmDeleteMulti ref="confirmDeleteMultiModal" :jobs="selectedJobIds" @popup-message="popupmessage('multidelete')" @refresh-data="refreshData" />
    <ConfirmRequeue ref="confirmRequeueModal" :job="jobData" @popup-message="popupmessage('requeue')" @refresh-data="refreshData" />
    <ConfirmRequeueMulti ref="confirmRequeueMultiModal" :jobs="selectedJobIds" @popup-message="popupmessage('multirequeue')" @refresh-data="refreshData" />
    <PopupMessage :deletec="deletec" :requeuec="requeuec" :createc="createc" />
    <NewJob ref="newJobModal" @popup-message="popupmessage('create')" @refresh-data="fetchData()" />
  </div>
</template>
