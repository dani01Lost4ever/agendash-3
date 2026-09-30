import { Document as MongoDocument } from 'mongodb';
import { Agenda, JobAttributesData } from '@sealos/agenda';

import { TaskLogStore } from '../task-logs';
import type { AgendashOptions } from '../options';
import { objectIdFor } from '../utils/object-id';

export class AgendashController {
  private readonly taskLogs?: TaskLogStore;
  private readonly detachListeners: Array<() => void> = [];

  constructor(
    private readonly agenda: Agenda,
    options: AgendashOptions = {},
  ) {
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

  getJobs = (job: string, state: string, options: {
    query: string,
    property: string,
    isObjectId: boolean,
    limit: number,
    skip: number
  }) => {
    const preMatch: MongoDocument = {}; // Use MongoDocument type
    if (job) {
      preMatch.name = job;
    }

    if (options.query && options.property) {
      if (options.isObjectId) {
        try { // Add validation for ObjectId
          preMatch[options.property] = new (objectIdFor(this.agenda._collection))(options.query);
        } catch (e) {
          console.warn(`Agendash: Invalid ObjectId format provided for query: ${options.query}`);
          // Decide how to handle - return empty, throw, etc. Here we might let the query fail.
          preMatch[options.property] = options.query; // Or maybe set to a value that won't match
        }
      } else if (/^\d+$/.test(options.query)) {
        preMatch[options.property] = Number.parseInt(options.query, 10);
      } else if (typeof options.query === 'string' && options.query.startsWith('/') && options.query.endsWith('/')) {
        // Basic Regex check
        try {
          const regexPattern = options.query.slice(1, -1);
          preMatch[options.property] = { $regex: regexPattern, $options: 'i' }; // Assume case-insensitive
        } catch (e) {
          console.warn(`Agendash: Invalid Regex format provided for query: ${options.query}`);
          preMatch[options.property] = options.query; // Fallback to exact match?
        }
      }
      else {
        // Default to case-insensitive substring search if not ObjectId, number, or explicit regex
        preMatch[options.property] = { $regex: options.query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), $options: 'i' }; // Escape regex chars
      }
    }

    const postMatch = {};
    if (state) {
      // Ensure state is one of the calculated properties
      const validStates = ['running', 'scheduled', 'queued', 'completed', 'failed', 'repeating'];
      if (validStates.includes(state)) {
        postMatch[state] = true;
      } else {
        console.warn(`Agendash: Invalid state filter provided: ${state}`);
      }
    }

    const collection = this.agenda._collection;
    // Add error handling for aggregation if possible, though less common
    return collection
      .aggregate([
        { $match: preMatch },
        {
          $sort: {
            // Existing sort...
            nextRunAt: -1, // Prioritize nextRunAt for more intuitive default sort
            lastRunAt: -1,
            lastFinishedAt: -1,
          },
        },
        {
          $project: {
            // Existing projection...
            job: '$$ROOT',
            _id: '$$ROOT._id',
            // Consider adding computed 'status' field here based on others for simpler client-side logic
            running: {
              $and: ['$lastRunAt', { $gt: ['$lastRunAt', '$lastFinishedAt'] }],
            },
            scheduled: {
              $and: ['$nextRunAt', { $gte: ['$nextRunAt', new Date()] }],
            },
            queued: { // This logic might need refinement depending on exact definition
              $and: [
                '$nextRunAt',
                { $lte: ['$nextRunAt', new Date()] }, // Should be less than or equal to now
                // Ensure it hasn't finished after the next run time was set (relevant for retries?)
                { $or: [ { $eq: ['$lastFinishedAt', null] }, { $lte: ['$lastFinishedAt', '$nextRunAt'] } ] }
              ],
            },
            completed: { // Ensure lastFinishedAt is the latest timestamp
              $and: [
                '$lastFinishedAt',
                { $gte: ['$lastFinishedAt', '$lastRunAt'] }, // Finished after last run started
                { $or: [ { $eq: ['$failedAt', null] }, { $lt: ['$failedAt', '$lastFinishedAt'] } ] } // Not failed or failed before last finish
              ],
            },
            failed: { // Ensure failedAt is the latest timestamp
              $and: [
                '$failedAt',
                { $gte: ['$failedAt', '$lastRunAt'] }, // Failed after last run started
                // Optional: Check if lastFinishedAt is also set and matches failedAt
                // { $eq: ['$lastFinishedAt', '$failedAt'] } // Agenda might set both on final failure
              ],
            },
            repeating: {
              $and: ['$repeatInterval', { $ne: ['$repeatInterval', null] }],
            },
          },
        },
        { $match: postMatch },
        {
          $facet: {
            // Existing facet...
            pages: [
              { $count: 'totalMatchs' },
              {
                $project: {
                  totalPages: {
                    $ceil: { $divide: ['$totalMatchs', options.limit] },
                  },
                },
              },
            ],
            filtered: [{ $skip: options.skip }, { $limit: options.limit }],
          },
        },
      ])
      .toArray();
  };

  getOverview = async () => {
    const collection = this.agenda._collection;
    const results = await collection
      .aggregate([
        // Project necessary fields and calculate states *before* grouping
        {
          $project: {
            _id: 1, // Keep _id if needed later, otherwise remove
            name: 1,
            // Calculate states based on timestamps
            running: {
              $and: ['$lastRunAt', { $gt: ['$lastRunAt', '$lastFinishedAt'] }],
            },
            scheduled: {
              $and: ['$nextRunAt', { $gte: ['$nextRunAt', new Date()] }],
            },
            queued: {
              $and: [
                '$nextRunAt',
                { $lte: ['$nextRunAt', new Date()] },
                { $or: [ { $eq: ['$lastFinishedAt', null] }, { $lte: ['$lastFinishedAt', '$nextRunAt'] } ] }
              ],
            },
            completed: {
              $and: [
                '$lastFinishedAt',
                { $gte: ['$lastFinishedAt', '$lastRunAt'] },
                { $or: [ { $eq: ['$failedAt', null] }, { $lt: ['$failedAt', '$lastFinishedAt'] } ] }
              ],
            },
            failed: {
              $and: [
                '$failedAt',
                { $gte: ['$failedAt', '$lastRunAt'] },
              ],
            },
            repeating: {
              $and: ['$repeatInterval', { $ne: ['$repeatInterval', null] }],
            },
          }
        },
        // Now group by name and sum the calculated boolean states (converted to 1 or 0)
        {
          $group: {
            _id: '$name', // Group by job name
            displayName: { $first: '$name' }, // Get the name
            // --- REMOVED meta field ---
            // meta: { /* ... */ }, // <--- REMOVE THIS LINE
            total: { $sum: 1 }, // Count total jobs per group
            // Sum the states (true becomes 1, false becomes 0)
            running: { $sum: { $cond: [ '$running', 1, 0 ] } },
            scheduled: { $sum: { $cond: [ '$scheduled', 1, 0 ] } },
            queued: { $sum: { $cond: [ '$queued', 1, 0 ] } },
            completed: { $sum: { $cond: [ '$completed', 1, 0 ] } },
            failed: { $sum: { $cond: [ '$failed', 1, 0 ] } },
            repeating: { $sum: { $cond: [ '$repeating', 1, 0 ] } },
          },
        },
        {
          $sort: { // Optional: Sort the grouped results by name
            displayName: 1
          }
        }
      ])
      .toArray();

    // Calculate totals across all job types
    const states = {
      running: 0,
      scheduled: 0,
      queued: 0,
      completed: 0,
      failed: 0,
      repeating: 0,
      total: 0,
    };
    const totals = { displayName: 'All Jobs', ...states };

    // Corrected loop syntax
    for (const job of results) {
      totals.running += job.running || 0;
      totals.scheduled += job.scheduled || 0;
      totals.queued += job.queued || 0;
      totals.completed += job.completed || 0;
      totals.failed += job.failed || 0;
      // Note: Repeating jobs are often also in another state (scheduled, completed, etc.)
      // totals.repeating might double-count if not careful.
      // Let's assume 'repeating' count from group is correct for jobs *defined* as repeating.
      totals.repeating += job.repeating || 0;
      totals.total += job.total || 0;
    }
    results.unshift(totals); // Add 'All Jobs' summary to the beginning
    return results;
  };

  api = async (
    job: string,
    state,
    { query: q, property, isObjectId, skip, limit },
  ) => {
    limit = Number.parseInt(limit, 10) || 200;
    skip = Number.parseInt(skip, 10) || 0;

    // Add try-catch for robustness
    try {
      const [overview, jobsResult] = await Promise.all([
        this.getOverview(),
        this.getJobs(job, state, { query: q, property, isObjectId, skip, limit }),
      ]);

      // Defensive check for jobsResult structure
      const jobs = jobsResult?.[0]?.filtered ?? [];
      const totalPages = jobsResult?.[0]?.pages?.[0]?.totalPages ?? 0;

      return {
        overview,
        jobs,
        totalPages,
        // title: 'Agendash', // Title seems static, maybe remove?
        currentRequest: {
          // title: 'Agendash',
          job: job || 'All Jobs',
          state,
        },
      };
    } catch (error) {
      console.error("Agendash API Error:", error);
      // Return a structured error response or re-throw
      throw error; // Or return { error: 'Failed to fetch data' }
    }
  };

  requeueJobs = async (jobIds) => {
    const collection = this.agenda._collection;
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      throw new Error('No job IDs provided for requeue');
    }
    const ObjectId = objectIdFor(collection);
    const objectIds = jobIds.map((jobId) => new ObjectId(jobId)); // Convert upfront

    const jobs = await collection
      .find({ _id: { $in: objectIds } })
      .toArray();

    if (jobs.length !== objectIds.length) {
      // Handle case where some jobs weren't found? Log a warning?
      console.warn(`Agendash: Requeue requested for ${objectIds.length} jobs, but only found ${jobs.length}.`);
      if (jobs.length === 0) {
        throw new Error('Jobs not found for requeue');
      }
    }

    const requeuePromises = jobs.map(job => {
      const newJob = this.agenda.create(job.name, job.data);
      return newJob.save();
    });

    await Promise.all(requeuePromises); // Wait for all saves

    return `${jobs.length} Job(s) requeued successfully`; // Return count
  };

  deleteJobs = (jobIds) => {
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return Promise.resolve({ deletedCount: 0 }); // Return consistent promise format
    }
    const ObjectId = objectIdFor(this.agenda._collection);
    return this.agenda.cancel({
      _id: { $in: jobIds.map((jobId) => new ObjectId(jobId)) },
    });
  };

  createJob = <T extends JobAttributesData>(jobName: string, jobSchedule: string, jobRepeatEvery: string, jobData: T) => {
    // @TODO: Need to validate user input.
    if (!jobName) {
      return Promise.reject(new Error('Job name is required'));
    }

    const job = this.agenda.create(jobName, jobData || {}); // Ensure jobData is at least an empty object

    let scheduled = false;
    if (jobSchedule) {
      job.schedule(jobSchedule);
      scheduled = true;
    }
    // If repeatAt is desired, it usually replaces schedule
    // if (jobSchedule && jobRepeatEvery) {
    //   job.repeatAt(jobSchedule); // This might not be what's intended - repeatAt sets the *first* run time for a repeating job
    //   job.repeatEvery(jobRepeatEvery);
    //   scheduled = true;
    // }
    if (jobRepeatEvery) {
      // If jobSchedule is also provided, Agenda might use it for the first run time via repeatAt implicitly or explicitly
      // If only jobRepeatEvery is provided, it runs immediately and then repeats.
      job.repeatEvery(jobRepeatEvery, {
        // Optionally add timezone or skipImmediate
        // timezone: '...',
        // skipImmediate: true
      });
      if (jobSchedule && !scheduled) { // If schedule was provided but not used for one-off, use it for first repeat time
        job.attrs.nextRunAt = undefined; // Clear potential immediate run from repeatEvery
        job.schedule(jobSchedule); // Schedule the first run
      }
      scheduled = true;
    }

    if (!scheduled) {
      return Promise.reject(new Error('Job must have a schedule or repeat interval'));
    }

    return job.save();
  };

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
