import type { SortDirection, SortField } from './api';

export interface Filters {
  /** Exact job name picked in the sidebar. */
  job: string;
  /** Free text (or /regex/) searched in job names. */
  search: string;
  state: string;
  /** Job document field searched for `q`. */
  property: string;
  q: string;
  isObjectId: boolean;
}

export interface ViewState {
  filters: Filters;
  page: number;
  pageSize: number;
  sortBy: SortField | '';
  sortDir: SortDirection;
  refreshSeconds: number;
  /** Job whose details are open. */
  jobId: string;
}

export const PAGE_SIZES = [10, 25, 50, 100, 200];
const SORT_FIELDS: SortField[] = ['name', 'nextRunAt', 'lastRunAt', 'lastFinishedAt'];

export const DEFAULT_VIEW: ViewState = {
  filters: { job: '', search: '', state: '', property: '', q: '', isObjectId: false },
  page: 1,
  pageSize: 50,
  sortBy: '',
  sortDir: 'desc',
  refreshSeconds: 0,
  jobId: '',
};

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Reads the view from the page URL, so links and reloads keep it. Also accepts the
 * parameters of earlier versions: `jobType` (state) and `name` (job name).
 */
export function readViewFromUrl(url = new URL(window.location.href)): ViewState {
  const params = url.searchParams;
  const sortBy = params.get('sortBy') as SortField | null;
  return {
    filters: {
      job: params.get('job') ?? params.get('name') ?? '',
      search: params.get('search') ?? '',
      state: params.get('state') ?? params.get('jobType') ?? '',
      property: params.get('property') ?? '',
      q: params.get('q') ?? '',
      isObjectId: params.get('isObjectId') === 'true',
    },
    page: positiveInt(params.get('page'), DEFAULT_VIEW.page),
    pageSize: positiveInt(params.get('limit'), DEFAULT_VIEW.pageSize),
    sortBy: sortBy && SORT_FIELDS.includes(sortBy) ? sortBy : '',
    sortDir: params.get('sortDir') === 'asc' ? 'asc' : 'desc',
    refreshSeconds: positiveInt(params.get('refresh'), DEFAULT_VIEW.refreshSeconds),
    jobId: params.get('jobId') ?? '',
  };
}

/** Writes the view to the URL without adding a history entry. Defaults are left out. */
export function writeViewToUrl(view: ViewState): void {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  const { filters } = view;
  if (filters.job) params.set('job', filters.job);
  if (filters.search) params.set('search', filters.search);
  if (filters.state) params.set('state', filters.state);
  if (filters.property && filters.q) {
    params.set('property', filters.property);
    params.set('q', filters.q);
    if (filters.isObjectId) params.set('isObjectId', 'true');
  }
  if (view.sortBy) {
    params.set('sortBy', view.sortBy);
    params.set('sortDir', view.sortDir);
  }
  if (view.page !== DEFAULT_VIEW.page) params.set('page', String(view.page));
  if (view.pageSize !== DEFAULT_VIEW.pageSize) params.set('limit', String(view.pageSize));
  if (view.refreshSeconds) params.set('refresh', String(view.refreshSeconds));
  if (view.jobId) params.set('jobId', view.jobId);

  const search = params.toString();
  const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  if (next !== `${url.pathname}${url.search}${url.hash}`) {
    window.history.replaceState(window.history.state, '', next);
  }
}
