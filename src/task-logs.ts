import { MongoClient, type Collection, type Db, type WithId } from 'mongodb';
import type { Agenda } from '@sealos/agenda';

import { DEFAULT_TASK_LOG_COLLECTION, type TaskLogOptions } from './options';
import { toLocalBson } from './utils/bson';

export type TaskLogStatus = 'started' | 'completed' | 'failed';

export interface TaskLog {
  taskId: string;
  taskName: string;
  status: TaskLogStatus;
  message: string;
  timestamp: Date;
  // Job data as stored by Agenda, typed as in 3.x
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

/** How long reads wait for Agenda's connection before failing. */
const AGENDA_READY_TIMEOUT_MS = 30_000;

interface StoreBackend {
  resolveDb: () => Promise<Db>;
  /** Makes an entry writable by the store's driver. */
  prepare?: (entry: TaskLog) => TaskLog;
  close?: () => Promise<void>;
}

/**
 * Stores job execution events in a MongoDB collection.
 *
 * The collection and document shape match the ones written by earlier Mongoose-based
 * versions (`tasklogs`), so existing logs stay readable.
 */
export class TaskLogStore {
  private collection?: Promise<Collection<TaskLog>>;
  private closed = false;

  private constructor(
    private readonly backend: StoreBackend,
    private readonly collectionName: string,
  ) {}

  /** Uses the database Agenda is connected to. */
  static fromAgenda(agenda: Agenda, collectionName = DEFAULT_TASK_LOG_COLLECTION): TaskLogStore {
    return new TaskLogStore(
      {
        resolveDb: async () => {
          if (!agenda._mdb) {
            // `_ready` never settles when Agenda fails to connect, so the wait is bounded
            await withTimeout(agenda._ready, AGENDA_READY_TIMEOUT_MS, 'Agendash: Agenda is not connected to MongoDB');
          }
          // Agenda may bundle a different major version of the driver than the one this
          // package resolves; the calls used here are the same in every supported version.
          return agenda._mdb as unknown as Db;
        },
      },
      collectionName,
    );
  }

  /**
   * Opens a dedicated connection, as `Agendash(agenda, connectionString)` always did. The client
   * is created on first use, so an invalid connection string or option is reported through the
   * failed log operations instead of crashing the host application at startup.
   */
  static fromConnectionString(
    connectionString: string,
    { connectionOptions = {}, collection = DEFAULT_TASK_LOG_COLLECTION }: TaskLogOptions = {},
  ): TaskLogStore {
    const { dbName, ...clientOptions } = connectionOptions;
    let client: MongoClient | undefined;
    let closed = false;
    return new TaskLogStore(
      {
        resolveDb: async () => {
          client ??= new MongoClient(connectionString, clientOptions);
          await client.connect();
          if (closed) {
            // close() ran while connecting: don't leave a connection open behind it
            await client.close();
            throw new Error('Agendash: the task log store is closed');
          }
          return client.db(dbName);
        },
        // Job data comes from Agenda's driver, which may use another major version of `bson`
        prepare: (entry) => ({ ...entry, data: toLocalBson(entry.data) }),
        close: async () => {
          closed = true;
          await client?.close();
        },
      },
      collection,
    );
  }

  static create(agenda: Agenda, options: TaskLogOptions = {}): TaskLogStore {
    return options.connectionString
      ? TaskLogStore.fromConnectionString(options.connectionString, options)
      : TaskLogStore.fromAgenda(agenda, options.collection);
  }

  private getCollection(): Promise<Collection<TaskLog>> {
    if (this.closed) {
      return Promise.reject(new Error('Agendash: the task log store is closed'));
    }
    if (!this.collection) {
      const pending = this.backend.resolveDb().then((db) => {
        const collection = db.collection<TaskLog>(this.collectionName);
        collection.createIndex({ taskId: 1, timestamp: -1 }).catch((error) => {
          if (!this.closed) {
            console.warn('Agendash: could not create the task log index', error);
          }
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
    const document: TaskLog = { ...entry, timestamp: new Date() };
    await collection.insertOne(this.backend.prepare ? this.backend.prepare(document) : document);
  }

  /** Most recent entries first. */
  async find(taskId: string, limit = 100): Promise<WithId<TaskLog>[]> {
    const collection = await this.getCollection();
    return collection.find({ taskId }).sort({ timestamp: -1 }).limit(limit).toArray();
  }

  /** Closes the dedicated connection, if this store opened one. The store cannot be used afterwards. */
  async close(): Promise<void> {
    this.closed = true;
    await this.backend.close?.();
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
