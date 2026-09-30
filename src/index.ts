import { Agendash } from './agendash';

export default Agendash;
export { Agendash };
export type { AgendashInstance } from './agendash';
export { AgendashController } from './controllers/agendash';
export type {
  AgendashOptions,
  LegacyConnectOptions,
  TaskLogConnectionOptions,
  TaskLogOptions,
} from './options';
export type { TaskLog, TaskLogStatus } from './task-logs';
export { createAuthMiddleware, createReadOnlyGuard } from './auth';
export type {
  AgendashAuthOptions,
  AgendashAuthStrategy,
  AgendashReadOnlyOption,
  ApiKeyAuthStrategy,
  AuthCommonOptions,
  BasicAuthStrategy,
  CookieAuthStrategy,
  CustomAuthStrategy,
  NoAuthStrategy,
} from './auth';
