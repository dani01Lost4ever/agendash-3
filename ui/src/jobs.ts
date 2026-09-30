import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import type { JobEntry, JobStateName } from './api';

dayjs.extend(relativeTime);

type DateInput = string | number | Date | null | undefined;

export type Tone = 'primary' | 'info' | 'warning' | 'success' | 'danger' | 'secondary';

/** Label, color and icon of each job state, in the order the dashboard lists them. */
export const STATE_META: Record<JobStateName, { label: string; tone: Tone; icon: string }> = {
  scheduled: { label: 'Scheduled', tone: 'info', icon: 'event' },
  queued: { label: 'Queued', tone: 'primary', icon: 'pending' },
  running: { label: 'Running', tone: 'warning', icon: 'autorenew' },
  completed: { label: 'Completed', tone: 'success', icon: 'check_circle' },
  failed: { label: 'Failed', tone: 'danger', icon: 'error' },
  repeating: { label: 'Repeating', tone: 'secondary', icon: 'repeat' },
  disabled: { label: 'Disabled', tone: 'secondary', icon: 'pause_circle' },
};

/** Relative time, e.g. "5 minutes ago". */
export function fromNow(date: DateInput): string {
  if (!date || !dayjs(date).isValid()) return '—';
  return dayjs(date).fromNow();
}

export function formatDate(date: DateInput, format = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!date || !dayjs(date).isValid()) return '—';
  return dayjs(date).format(format);
}

export function timestamp(date: DateInput): number {
  return date && dayjs(date).isValid() ? dayjs(date).valueOf() : 0;
}

/** "850 ms", "12.4 s", "3 min 5 s", "2 h 10 min". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${Math.round(seconds % 60)} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** The single state shown for a job, the most relevant first. */
export function mainState(job: JobEntry | null | undefined): JobStateName | undefined {
  if (!job) return undefined;
  if (job.running) return 'running';
  if (job.failed) return 'failed';
  if (job.queued) return 'queued';
  if (job.completed) return 'completed';
  if (job.scheduled) return 'scheduled';
  if (job.repeating) return 'repeating';
  return undefined;
}

export function statusText(job: JobEntry | null | undefined): string {
  const state = mainState(job);
  return state ? STATE_META[state].label : 'Unknown';
}

export function statusTone(job: JobEntry | null | undefined): Tone {
  const state = mainState(job);
  return state ? STATE_META[state].tone : 'secondary';
}

export function isDisabled(job: JobEntry | null | undefined): boolean {
  return Boolean(job?.disabled ?? job?.job?.disabled);
}

export function formatJSON(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return String(value);
}

/**
 * The API matches `job` exactly unless it is a `/regex/`. Free text typed in the search box
 * becomes a case-insensitive "contains" regex; a `/regex/` typed by the user is kept as is.
 */
export function nameSearchQuery(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.length > 1 && trimmed.startsWith('/') && trimmed.endsWith('/')) return trimmed;
  return `/${trimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}/`;
}
