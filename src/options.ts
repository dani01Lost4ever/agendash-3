import type { MongoClientOptions } from 'mongodb';

import type { AgendashAuthOptions, AgendashReadOnlyOption } from './auth/types';

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
  /**
   * Origins allowed to show the dashboard in a frame (the Content-Security-Policy
   * `frame-ancestors` directive). Defaults to `["'self'"]`: only pages of the host application's
   * own origin can embed it. Example: `['https://app.example.com']`. Use `["'none'"]` to forbid
   * framing entirely.
   */
  frameAncestors?: string[];
  /**
   * Authentication for the dashboard and its API: `none` (default), `apiKey`, `cookie`, `basic`
   * or `custom`, alone or combined. See docs/authentication.md.
   */
  auth?: AgendashAuthOptions;
  /** Refuse every request that would change jobs (create, requeue, delete). Default `false`. */
  readOnly?: AgendashReadOnlyOption;
}

/**
 * Options accepted by the legacy `Agendash(agenda, connectionString, options)` form, i.e. the
 * Mongoose `ConnectOptions` of 3.x. Mongoose-only keys are ignored, driver options are passed
 * through. Typed loosely so a variable typed with Mongoose's own `ConnectOptions` still compiles.
 */
export interface LegacyConnectOptions {
  dbName?: string;
  user?: string;
  pass?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const DEFAULT_TASK_LOG_COLLECTION = 'tasklogs';

// Options Mongoose understands but the MongoDB driver does not.
const MONGOOSE_ONLY_OPTIONS = [
  'autoCreate',
  'autoIndex',
  'autoSearchIndex',
  'bufferCommands',
  'bufferTimeoutMS',
  'config',
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
  // Like Mongoose, empty credentials leave the ones in the connection string in place
  if ((options.user || options.pass) && driverOptions.auth === undefined) {
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
