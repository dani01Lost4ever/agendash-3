import type { MongoClientOptions } from 'mongodb';

/** Driver options for a dedicated task-log connection. */
export type TaskLogConnectionOptions = MongoClientOptions & {
  /** Database to use. Defaults to the database named in the connection string. */
  dbName?: string;
};

export interface TaskLogOptions {
  /**
   * Connection string for a dedicated MongoDB connection. When omitted, task logs are
   * stored in the database Agenda is connected to.
   */
  connectionString?: string;
  /** Options for the dedicated connection. Ignored without `connectionString`. */
  connectionOptions?: TaskLogConnectionOptions;
  /** Collection holding the logs. Defaults to `tasklogs`. */
  collection?: string;
}

export interface AgendashOptions {
  /**
   * Logging of job `start`, `complete` and `fail` events, shown in the job details.
   * Enabled by default; pass `false` to turn it off.
   */
  taskLogs?: TaskLogOptions | false;
}

/**
 * Options accepted by the legacy `Agendash(agenda, connectionString, options)` form.
 * Mongoose-only keys are accepted and ignored, driver options are passed through.
 */
export type LegacyConnectOptions = TaskLogConnectionOptions & {
  user?: string;
  pass?: string;
  [key: string]: unknown;
};

export const DEFAULT_TASK_LOG_COLLECTION = 'tasklogs';

// Options Mongoose understands but the MongoDB driver does not.
const MONGOOSE_ONLY_OPTIONS = [
  'autoCreate',
  'autoIndex',
  'bufferCommands',
  'bufferTimeoutMS',
  'pass',
  'promiseLibrary',
  'sanitizeFilter',
  'useCreateIndex',
  'useFindAndModify',
  'useNewUrlParser',
  'useUnifiedTopology',
  'user',
];

function toDriverOptions(options: LegacyConnectOptions = {}): TaskLogConnectionOptions {
  const driverOptions: Record<string, unknown> = { ...options };
  for (const key of MONGOOSE_ONLY_OPTIONS) {
    delete driverOptions[key];
  }
  if (options.user !== undefined && driverOptions.auth === undefined) {
    driverOptions.auth = { username: options.user, password: options.pass };
  }
  return driverOptions;
}

/**
 * Accepts both call forms of `Agendash()` and returns the options object:
 * - `Agendash(agenda, options?)`
 * - `Agendash(agenda, connectionString, connectOptions?)` (legacy, task logs on a dedicated connection)
 */
export function normalizeOptions(
  optionsOrConnectionString?: AgendashOptions | string,
  legacyConnectOptions?: LegacyConnectOptions,
): AgendashOptions {
  if (typeof optionsOrConnectionString === 'string') {
    return {
      taskLogs: {
        connectionString: optionsOrConnectionString,
        connectionOptions: toDriverOptions(legacyConnectOptions),
      },
    };
  }
  return { ...optionsOrConnectionString };
}
