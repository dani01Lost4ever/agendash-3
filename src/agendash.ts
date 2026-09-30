import type { Agenda } from '@sealos/agenda';
import type { Express } from 'express';

import { createAuthMiddleware, createConfigRouter, createReadOnlyGuard } from './auth';
import { AgendashController } from './controllers/agendash';
import { frameAncestorsSources } from './http/csp';
import { createMiddleware } from './http/router';
import { normalizeOptions, type AgendashOptions, type LegacyConnectOptions } from './options';

export interface AgendashInstance {
  /** Express app to mount on a path of the host application, e.g. `app.use('/dash', middleware)`. */
  middleware: Express;
  controller: AgendashController;
}

/**
 * Creates the dashboard for an Agenda instance.
 *
 * @example
 * const { middleware } = Agendash(agenda);
 * app.use('/dash', middleware);
 */
export function Agendash(agenda: Agenda, options?: AgendashOptions): AgendashInstance;
/**
 * Legacy form: task logs are stored through a dedicated connection to `connectionString`.
 * Equivalent to `Agendash(agenda, { taskLogs: { connectionString, connectionOptions } })`.
 */
export function Agendash(
  agenda: Agenda,
  connectionString: string,
  connectOptions?: LegacyConnectOptions,
): AgendashInstance;
export function Agendash(
  agenda: Agenda,
  optionsOrConnectionString?: AgendashOptions | string,
  legacyConnectOptions?: LegacyConnectOptions,
): AgendashInstance {
  const options = normalizeOptions(optionsOrConnectionString, legacyConnectOptions);
  // Validated before the controller starts listening to Agenda, like the auth options below
  const frameAncestors = frameAncestorsSources(options.frameAncestors);
  // Built first so that invalid auth options throw before any connection is opened.
  const before = [createAuthMiddleware(options.auth)];
  const beforeApi = [createReadOnlyGuard(options.readOnly), createConfigRouter(options)];
  const controller = new AgendashController(agenda, options);
  const middleware = createMiddleware(controller, { before, beforeApi, frameAncestors });
  return { middleware, controller };
}
