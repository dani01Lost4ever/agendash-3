/** HTTP client for the Agendash API. All requests go through `request()`. */

import { applyCredentials, shouldRetry } from './auth';

export const JOB_STATES = ['scheduled', 'queued', 'running', 'completed', 'failed', 'repeating', 'disabled'] as const;
export type JobStateName = (typeof JOB_STATES)[number];

export interface JobDocument {
  _id: string;
  name: string;
  data?: unknown;
  priority?: number;
  repeatInterval?: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastFinishedAt?: string | null;
  lockedAt?: string | null;
  failedAt?: string | null;
  failCount?: number;
  failReason?: string;
  repeatTimezone?: string | null;
  disabled?: boolean;
  type?: string;
  [key: string]: unknown;
}

/** A job as listed by the API: the document plus its computed states. */
export type JobEntry = { _id: string; job: JobDocument } & Record<JobStateName, boolean>;

export type OverviewEntry = { displayName: string; total: number } & Record<JobStateName, number>;

export interface JobsResponse {
  overview: OverviewEntry[];
  jobs: JobEntry[];
  totalJobs: number;
  totalPages: number;
}

export type SortField = 'name' | 'nextRunAt' | 'lastRunAt' | 'lastFinishedAt';
export type SortDirection = 'asc' | 'desc';

/** Result of run now, disable and enable. */
export interface JobUpdateResult {
  /** Jobs the change applied to. */
  updated: number;
  /** Jobs left untouched because they are running (or disabled, when running now). */
  skipped: number;
}

export interface TaskLog {
  _id: string;
  taskId: string;
  taskName: string;
  status: 'started' | 'completed' | 'failed';
  message: string;
  timestamp: string;
  data?: unknown;
}

export interface JobsQuery {
  limit: number | string;
  job: string;
  skip: number | string;
  property: string;
  isObjectId: boolean;
  state: string;
  q: string;
  sortBy?: SortField | '';
  sortDir?: SortDirection;
}

export interface NewJob {
  jobName: string;
  jobSchedule: string;
  jobRepeatEvery: string;
  jobData: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const message = (body as { message?: unknown } | null)?.message;
    super(typeof message === 'string' ? message : `Request failed with status ${status}`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Lets the server tell API calls from page navigations; also required for CSRF protection.
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const sentKey = applyCredentials(headers);
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers });
  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const body: unknown = isJson ? await response.json() : await response.text();
  if (response.status === 401 && (await shouldRetry(body, sentKey))) {
    return request<T>(path, init);
  }
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

// Paths are relative so the dashboard works under any mount path of the host app.
export const api = {
  getConfig(): Promise<{ readOnly: boolean }> {
    return request<{ readOnly: boolean }>('api/config');
  },
  getJobs({ limit, job, skip, property, isObjectId, state, q, sortBy, sortDir }: JobsQuery): Promise<JobsResponse> {
    const params = new URLSearchParams({ limit: String(limit), job, skip: String(skip), property });
    if (isObjectId) {
      params.set('isObjectId', 'true');
    }
    if (state) {
      params.set('state', state);
    }
    params.set('q', q);
    if (sortBy) {
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir ?? 'desc');
    }
    return request<JobsResponse>(`api?${params.toString()}`);
  },
  getJob(jobId: string): Promise<JobEntry> {
    return request<JobEntry>(`api/jobs/${encodeURIComponent(jobId)}`);
  },
  getTaskLogs(jobId: string): Promise<TaskLog[]> {
    return request<TaskLog[]>(`api/jobs/${encodeURIComponent(jobId)}/logs`);
  },
  requeueJobs(jobIds: string[]): Promise<unknown> {
    return post('api/jobs/requeue', { jobIds });
  },
  deleteJobs(jobIds: string[]): Promise<{ deleted?: boolean; message?: string }> {
    return post('api/jobs/delete', { jobIds });
  },
  runJobs(jobIds: string[]): Promise<JobUpdateResult> {
    return post('api/jobs/run', { jobIds });
  },
  disableJobs(jobIds: string[]): Promise<JobUpdateResult> {
    return post('api/jobs/disable', { jobIds });
  },
  enableJobs(jobIds: string[]): Promise<JobUpdateResult> {
    return post('api/jobs/enable', { jobIds });
  },
  createJob(job: NewJob): Promise<{ created: boolean }> {
    return post('api/jobs/create', job);
  },
};

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
