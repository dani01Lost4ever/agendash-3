import type { Document as MongoDocument, ObjectId } from 'mongodb';
import { Agenda, JobAttributesData } from '@sealos/agenda';

import { AgendashError } from '../errors';
import { TaskLogStore } from '../task-logs';
import { normalizeOptions, type AgendashOptions, type LegacyConnectOptions } from '../options';
import { objectIdFor } from '../utils/object-id';
import {
  JOB_STATES,
  isJobState,
  jobStateFields,
  nameMatch,
  propertyMatch,
  sortStage,
  type JobState,
  type SortDirection,
} from './job-query';

export interface JobListOptions {
  /** Job name, or `/pattern/` for a case-insensitive regex. */
  job?: string;
  state?: string;
  /** Value searched in `property`. */
  query?: string;
  property?: string;
  isObjectId?: boolean;
  limit: number;
  skip: number;
  sortBy?: string;
  sortDir?: SortDirection;
}

/** Query string parameters of `GET /api`. */
export interface ApiQuery {
  query?: string;
  property?: string;
  isObjectId?: string | boolean;
  skip?: string;
  limit?: string;
  sortBy?: string;
  sortDir?: string;
}

export type JobListItem = { job: MongoDocument; _id: unknown } & Record<JobState, boolean>;

export type OverviewItem = {
  _id?: string;
  displayName: string;
  total: number;
} & Partial<Record<JobState, number>>;

export interface JobUpdateResult {
  /** Jobs the change applied to. */
  updated: number;
  /** Jobs whose document actually changed (e.g. not already disabled). */
  changed: number;
  /** Jobs left untouched because they are running (or disabled, when running now). */
  skipped: number;
}

export class AgendashController {
  private readonly taskLogs?: TaskLogStore;
  private readonly detachListeners: Array<() => void> = [];

  constructor(agenda: Agenda, options?: AgendashOptions);
  /** Legacy form of 3.x: task logs on a dedicated connection to `connectionString`. */
  constructor(agenda: Agenda, connectionString: string, connectOptions?: LegacyConnectOptions);
  constructor(
    private readonly agenda: Agenda,
    optionsOrConnectionString?: AgendashOptions | string,
    legacyConnectOptions?: LegacyConnectOptions,
  ) {
    const options = normalizeOptions(optionsOrConnectionString, legacyConnectOptions);
    // Indexes used by the job list sort. `_ready` also resolves when Agenda was ready
    // before Agendash was created, which a 'ready' listener would miss.
    agenda._ready
      .then(() =>
        agenda._collection.createIndexes([
          { key: { nextRunAt: -1, lastRunAt: -1, lastFinishedAt: -1 } },
          { key: { name: 1, nextRunAt: -1, lastRunAt: -1, lastFinishedAt: -1 } },
        ]),
      )
      .catch((err) => {
        console.error('Agendash: Error creating Agenda indexes', err);
      });

    if (options.taskLogs === false) {
      return;
    }
    const taskLogs = TaskLogStore.create(agenda, options.taskLogs);
    this.taskLogs = taskLogs;

    const listen = (event: string, listener: (...args: any[]) => void) => {
      agenda.on(event, listener);
      this.detachListeners.push(() => agenda.off(event, listener));
    };

    listen('start', (job) => {
      taskLogs.add({
        taskId: job.attrs._id.toString(),
        taskName: job.attrs.name,
        status: 'started',
        message: 'Task started',
        data: job.attrs.data,
      }).catch(err => console.error("Agendash: Error logging 'start' event:", err));
    });

    listen('complete', (job) => {
      taskLogs.add({
        taskId: job.attrs._id.toString(),
        taskName: job.attrs.name,
        status: 'completed',
        message: 'Task completed successfully',
        data: job.attrs.data,
      }).catch(err => console.error("Agendash: Error logging 'complete' event:", err));
    });

    listen('fail', (err, job) => {
      taskLogs.add({
        taskId: job.attrs._id.toString(),
        taskName: job.attrs.name,
        status: 'failed',
        message: err?.message || 'Unknown failure reason',
        data: job.attrs.data,
      }).catch(err => console.error("Agendash: Error logging 'fail' event:", err));
    });
  }

  // Newest first, at most 100 entries
  getTaskLogs = async (taskId: string) => {
    return this.taskLogs ? this.taskLogs.find(taskId, 100) : [];
  }

  /** Jobs matching the filters, one page of them, with their state flags. */
  getJobs = async (options: JobListOptions): Promise<{ jobs: JobListItem[]; totalJobs: number; totalPages: number }> => {
    const now = new Date();
    const collection = this.agenda._collection;

    const preMatch: MongoDocument = {};
    if (options.job) {
      preMatch.name = nameMatch(options.job);
    }
    if (options.query && options.property) {
      if (options.property.startsWith('$')) {
        throw new AgendashError(`Invalid property: ${options.property}`);
      }
      const ObjectId = objectIdFor(collection);
      preMatch[options.property] = propertyMatch(
        options.query,
        options.isObjectId ? (value) => new ObjectId(value) : undefined,
      );
    }

    const postMatch: MongoDocument = {};
    if (options.state) {
      if (isJobState(options.state)) {
        postMatch[options.state] = true;
      } else {
        console.warn(`Agendash: Invalid state filter provided: ${options.state}`);
      }
    }

    const [result] = await collection
      .aggregate<{ pages: Array<{ totalJobs: number }>; filtered: JobListItem[] }>([
        { $match: preMatch },
        { $sort: sortStage(options.sortBy, options.sortDir) },
        {
          $project: {
            job: '$$ROOT',
            _id: '$$ROOT._id',
            ...jobStateFields(now),
          },
        },
        { $match: postMatch },
        {
          $facet: {
            pages: [{ $count: 'totalJobs' }],
            filtered: [{ $skip: options.skip }, { $limit: options.limit }],
          },
        },
      ])
      .toArray();

    const totalJobs = result?.pages?.[0]?.totalJobs ?? 0;
    return {
      jobs: result?.filtered ?? [],
      totalJobs,
      totalPages: Math.ceil(totalJobs / options.limit),
    };
  };

  /** Number of jobs in each state, per job name, preceded by the totals across all names. */
  getOverview = async (): Promise<OverviewItem[]> => {
    const states = jobStateFields(new Date());
    const results = await this.agenda._collection
      .aggregate<OverviewItem>([
        { $project: { name: 1, ...states } },
        {
          $group: {
            _id: '$name',
            displayName: { $first: '$name' },
            total: { $sum: 1 },
            ...Object.fromEntries(
              JOB_STATES.map((state) => [state, { $sum: { $cond: [`$${state}`, 1, 0] } }]),
            ),
          },
        },
        { $sort: { displayName: 1 } },
      ])
      .toArray();

    const totals: OverviewItem = { displayName: 'All Jobs', total: 0 };
    for (const state of JOB_STATES) {
      totals[state] = 0;
    }
    for (const item of results) {
      totals.total += item.total || 0;
      for (const state of JOB_STATES) {
        totals[state] = (totals[state] ?? 0) + (item[state] || 0);
      }
    }
    return [totals, ...results];
  };

  api = async (
    job: string,
    state: string,
    { query, property, isObjectId, skip, limit, sortBy, sortDir }: ApiQuery,
  ) => {
    const options: JobListOptions = {
      job,
      state,
      query,
      property,
      isObjectId: Boolean(isObjectId) && isObjectId !== 'false',
      limit: Number.parseInt(limit ?? '', 10) || 200,
      skip: Number.parseInt(skip ?? '', 10) || 0,
      sortBy,
      sortDir: sortDir === 'asc' ? 'asc' : 'desc',
    };

    try {
      const [overview, { jobs, totalJobs, totalPages }] = await Promise.all([
        this.getOverview(),
        this.getJobs(options),
      ]);

      return {
        overview,
        jobs,
        totalJobs,
        totalPages,
        currentRequest: {
          job: job || 'All Jobs',
          state,
        },
      };
    } catch (error) {
      if (!(error instanceof AgendashError)) {
        console.error('Agendash API Error:', error);
      }
      throw error;
    }
  };

  /** A single job with its state flags, as in the job list. */
  getJob = async (jobId: string): Promise<JobListItem> => {
    const [_id] = this.toObjectIds([jobId]);
    const [job] = await this.agenda._collection
      .aggregate<JobListItem>([
        { $match: { _id } },
        { $project: { job: '$$ROOT', _id: '$$ROOT._id', ...jobStateFields(new Date()) } },
      ])
      .toArray();
    if (!job) {
      throw new AgendashError('Job not found', 404);
    }
    return job;
  };

  /** Creates a new job with the name and data of each job, to run now. */
  requeueJobs = async (jobIds: unknown) => {
    const collection = this.agenda._collection;
    const objectIds = this.toObjectIds(jobIds);

    const jobs = await collection
      .find({ _id: { $in: objectIds } })
      .toArray();

    if (jobs.length === 0) {
      throw new AgendashError('Jobs not found for requeue', 404);
    }
    if (jobs.length !== objectIds.length) {
      console.warn(`Agendash: Requeue requested for ${objectIds.length} jobs, but only found ${jobs.length}.`);
    }

    await Promise.all(jobs.map((job) => this.agenda.create(job.name, job.data).save()));

    return `${jobs.length} Job(s) requeued successfully`;
  };

  deleteJobs = (jobIds: unknown) => {
    return this.agenda.cancel({ _id: { $in: this.toObjectIds(jobIds) } });
  };

  /**
   * Runs the jobs at the next Agenda scan, keeping their schedule and repeat settings.
   * Running and disabled jobs are skipped.
   */
  runJobsNow = (jobIds: unknown): Promise<JobUpdateResult> => {
    return this.updateJobs(jobIds, { disabled: { $ne: true } }, { $set: { nextRunAt: new Date() } });
  };

  /** Stops Agenda from running the jobs until they are enabled again. Running jobs are skipped. */
  disableJobs = (jobIds: unknown): Promise<JobUpdateResult> => {
    return this.updateJobs(jobIds, {}, { $set: { disabled: true } });
  };

  enableJobs = (jobIds: unknown): Promise<JobUpdateResult> => {
    return this.updateJobs(jobIds, {}, { $set: { disabled: false } });
  };

  createJob = async <T extends JobAttributesData>(
    jobName: string,
    jobSchedule?: string,
    jobRepeatEvery?: string,
    jobData?: T,
  ) => {
    if (!jobName || typeof jobName !== 'string') {
      throw new AgendashError('Job name is required');
    }
    if (!jobSchedule && !jobRepeatEvery) {
      throw new AgendashError('Job must have a schedule or repeat interval');
    }

    const job = this.agenda.create(jobName, jobData || {});

    if (jobRepeatEvery) {
      // Without a schedule the first run is now, otherwise at the scheduled time.
      job.repeatEvery(jobRepeatEvery);
      if (!job.attrs.nextRunAt) {
        throw new AgendashError(`Invalid repeat interval: ${jobRepeatEvery}`);
      }
    }
    if (jobSchedule) {
      job.schedule(jobSchedule);
      if (!job.attrs.nextRunAt || Number.isNaN(new Date(job.attrs.nextRunAt).getTime())) {
        throw new AgendashError(`Invalid schedule: ${jobSchedule}`);
      }
    }

    return job.save();
  };

  /**
   * Applies `update` to the jobs that are not locked by a worker: Agenda saves the whole
   * job document when a run ends, which would undo changes made while it runs.
   */
  private async updateJobs(jobIds: unknown, filter: MongoDocument, update: MongoDocument): Promise<JobUpdateResult> {
    const collection = this.agenda._collection;
    const _id = { $in: this.toObjectIds(jobIds) };
    const [{ modifiedCount, matchedCount }, found] = await Promise.all([
      collection.updateMany({ ...filter, _id, lockedAt: null }, update),
      collection.countDocuments({ _id }),
    ]);
    if (found === 0) {
      throw new AgendashError('Jobs not found', 404);
    }
    return { updated: matchedCount, changed: modifiedCount, skipped: found - matchedCount };
  }

  private toObjectIds(jobIds: unknown): ObjectId[] {
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      throw new AgendashError('No job IDs provided');
    }
    const ObjectIdClass = objectIdFor(this.agenda._collection);
    return jobIds.map((jobId: unknown) => {
      if (typeof jobId !== 'string' || !ObjectIdClass.isValid(jobId)) {
        throw new AgendashError(`Invalid job ID: ${String(jobId)}`);
      }
      return new ObjectIdClass(jobId);
    });
  }

  /** Stops listening to Agenda events and closes the dedicated task-log connection, if any. */
  async close(): Promise<void> {
    this.detachListeners.splice(0).forEach((detach) => detach());
    await this.taskLogs?.close();
  }

  /** @deprecated Use `close()`. */
  closeMongooseConnection(): Promise<void> {
    return this.close();
  }
}
