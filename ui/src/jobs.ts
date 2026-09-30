import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import type { JobEntry } from './api';

dayjs.extend(relativeTime);

type DateInput = string | number | Date | null | undefined;

/** Relative time, e.g. "5 minutes ago". */
export function fromNow(date: DateInput): string {
  if (!date || !dayjs(date).isValid()) return 'N/A';
  return dayjs(date).fromNow();
}

export function formatDate(date: DateInput, format: string): string {
  if (!date || !dayjs(date).isValid()) return 'N/A';
  return dayjs(date).format(format);
}

export function timestamp(date: DateInput): number {
  return date && dayjs(date).isValid() ? dayjs(date).valueOf() : 0;
}

export function statusClass(job: JobEntry | null | undefined): string {
  if (!job) return 'text-bg-secondary';
  if (job.failed) return 'text-bg-danger';
  if (job.running) return 'text-bg-warning';
  if (job.completed) return 'text-bg-success';
  if (job.queued) return 'text-bg-primary';
  if (job.scheduled || job.repeating) return 'text-bg-info';
  return 'text-bg-secondary';
}

export function statusText(job: JobEntry | null | undefined): string {
  if (!job) return 'Unknown';
  if (job.failed) return 'Failed';
  if (job.running) return 'Running';
  if (job.completed) return 'Completed';
  if (job.queued) return 'Queued';
  if (job.repeating) return `Repeating (${job.job?.repeatInterval || '?'})`;
  if (job.scheduled) return 'Scheduled';
  return 'Unknown';
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
