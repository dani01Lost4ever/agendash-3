import type { Document } from 'mongodb';

import { AgendashError } from '../errors';

export const JOB_STATES = [
  'running',
  'scheduled',
  'queued',
  'completed',
  'failed',
  'repeating',
  'disabled',
] as const;
export type JobState = (typeof JOB_STATES)[number];

export const SORT_FIELDS = [
  'name',
  'nextRunAt',
  'lastRunAt',
  'lastFinishedAt',
  'failedAt',
  'priority',
] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

// Served by the index Agendash creates on the jobs collection.
const DEFAULT_SORT = { nextRunAt: -1, lastRunAt: -1, lastFinishedAt: -1 };

export function isJobState(value: unknown): value is JobState {
  return JOB_STATES.includes(value as JobState);
}

/** Aggregation expressions computing each state flag of a job document at `now`. */
export function jobStateFields(now: Date): Record<JobState, Document> {
  return {
    running: {
      $and: ['$lastRunAt', { $gt: ['$lastRunAt', '$lastFinishedAt'] }],
    },
    scheduled: {
      $and: ['$nextRunAt', { $gte: ['$nextRunAt', now] }],
    },
    queued: {
      $and: [
        '$nextRunAt',
        { $lte: ['$nextRunAt', now] },
        // Not finished since it was scheduled
        { $or: [{ $eq: ['$lastFinishedAt', null] }, { $lte: ['$lastFinishedAt', '$nextRunAt'] }] },
      ],
    },
    completed: {
      $and: [
        '$lastFinishedAt',
        { $gte: ['$lastFinishedAt', '$lastRunAt'] },
        // Never failed, or failed before its last successful run
        { $or: [{ $eq: ['$failedAt', null] }, { $lt: ['$failedAt', '$lastFinishedAt'] }] },
      ],
    },
    failed: {
      $and: ['$failedAt', { $gte: ['$failedAt', '$lastRunAt'] }],
    },
    repeating: {
      $and: ['$repeatInterval', { $ne: ['$repeatInterval', null] }],
    },
    disabled: { $eq: ['$disabled', true] },
  };
}

function assertValidRegex(pattern: string): void {
  try {
    new RegExp(pattern);
  } catch {
    throw new AgendashError(`Invalid regular expression: /${pattern}/`);
  }
}

function asRegex(value: string): string | undefined {
  return value.length > 1 && value.startsWith('/') && value.endsWith('/')
    ? value.slice(1, -1)
    : undefined;
}

/** `/pattern/` matches names case-insensitively, anything else is an exact name. */
export function nameMatch(name: string): Document | string {
  const pattern = asRegex(name);
  if (pattern === undefined) {
    return name;
  }
  assertValidRegex(pattern);
  return { $regex: pattern, $options: 'i' };
}

/**
 * Match on a job property: an ObjectId when `toObjectId` is given, a number for digits,
 * a regex for `/pattern/`, otherwise a case-insensitive substring.
 */
export function propertyMatch(query: string, toObjectId?: (value: string) => unknown): unknown {
  if (toObjectId) {
    try {
      return toObjectId(query);
    } catch {
      console.warn(`Agendash: Invalid ObjectId format provided for query: ${query}`);
      return query;
    }
  }
  if (/^\d+$/.test(query)) {
    return Number.parseInt(query, 10);
  }
  const pattern = asRegex(query);
  if (pattern !== undefined) {
    assertValidRegex(pattern);
    return { $regex: pattern, $options: 'i' };
  }
  return { $regex: query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), $options: 'i' };
}

export function sortStage(sortBy?: string, sortDir?: string): Document {
  if (!SORT_FIELDS.includes(sortBy as SortField)) {
    return DEFAULT_SORT;
  }
  const direction = sortDir === 'asc' ? 1 : -1;
  // _id keeps the order stable across pages when values are equal
  return { [sortBy as SortField]: direction, _id: direction };
}
