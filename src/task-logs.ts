import { MongoClient, type Collection, type Db } from 'mongodb';
import type { Agenda } from '@sealos/agenda';

import { DEFAULT_TASK_LOG_COLLECTION, type TaskLogOptions } from './options';

export type TaskLogStatus = 'started' | 'completed' | 'failed';

export interface TaskLog {
  taskId: string;
  taskName: string;
  status: TaskLogStatus;
  message: string;
  timestamp: Date;
  data?: unknown;
}

/**
 * Stores job execution events in a MongoDB collection.
 *
 * The collection and document shape match the ones written by earlier Mongoose-based
 * versions (`tasklogs`), so existing logs stay readable.
 */
export class TaskLogStore {
  private collection?: Promise<Collection<TaskLog>>;

  private constructor(
    private readonly resolveDb: () => Promise<Db>,
    private readonly collectionName: string,
    private readonly client?: MongoClient,
  ) {}

  /** Uses the database Agenda is connected to, once Agenda is ready. */
  static fromAgenda(agenda: Agenda, collectionName = DEFAULT_TASK_LOG_COLLECTION): TaskLogStore {
    return new TaskLogStore(async () => {
      await agenda._ready;
      // Agenda may bundle a different major version of the driver than the one this
      // package resolves; the calls used here are the same in every supported version.
      return agenda._mdb as unknown as Db;
    }, collectionName);
  }

  /** Opens a dedicated connection, as `Agendash(agenda, connectionString)` always did. */
  static fromConnectionString(
    connectionString: string,
    { connectionOptions = {}, collection = DEFAULT_TASK_LOG_COLLECTION }: TaskLogOptions = {},
  ): TaskLogStore {
    const { dbName, ...clientOptions } = connectionOptions;
    const client = new MongoClient(connectionString, clientOptions);
    return new TaskLogStore(
      async () => {
        await client.connect();
        return client.db(dbName);
      },
      collection,
      client,
    );
  }

  static create(agenda: Agenda, options: TaskLogOptions = {}): TaskLogStore {
    return options.connectionString
      ? TaskLogStore.fromConnectionString(options.connectionString, options)
      : TaskLogStore.fromAgenda(agenda, options.collection);
  }

  private getCollection(): Promise<Collection<TaskLog>> {
    if (!this.collection) {
      const pending = this.resolveDb().then((db) => {
        const collection = db.collection<TaskLog>(this.collectionName);
        collection.createIndex({ taskId: 1, timestamp: -1 }).catch((error) => {
          console.warn('Agendash: could not create the task log index', error);
        });
        return collection;
      });
      // Let a failed connection be retried on the next call instead of caching the error.
      pending.catch(() => {
        if (this.collection === pending) {
          this.collection = undefined;
        }
      });
      this.collection = pending;
    }
    return this.collection;
  }

  async add(entry: Omit<TaskLog, 'timestamp'>): Promise<void> {
    const collection = await this.getCollection();
    await collection.insertOne({ ...entry, timestamp: new Date() });
  }

  /** Most recent entries first. */
  async find(taskId: string, limit = 100): Promise<TaskLog[]> {
    const collection = await this.getCollection();
    return collection.find({ taskId }).sort({ timestamp: -1 }).limit(limit).toArray();
  }

  /** Closes the dedicated connection, if this store opened one. */
  async close(): Promise<void> {
    await this.client?.close();
  }
}
