import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Authenticator, configError, createAuthenticator } from './strategies';
import { createTicketStrategy } from './ticket';
import type {
  AgendashAuthInfo,
  AgendashAuthOptions,
  AgendashAuthStrategy,
  AgendashReadOnlyOption,
  AuthCommonOptions,
} from './types';

export * from './types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const passThrough: RequestHandler = (_req, _res, next) => next();

const authInfo = new WeakMap<Request, AgendashAuthInfo>();

/**
 * Who the auth middleware let in: the strategy and what its verify function returned. For
 * `readOnly(req)` and host code running after Agendash's auth; `undefined` without auth.
 */
export function getAgendashAuth(req: Request): AgendashAuthInfo | undefined {
  return authInfo.get(req);
}

interface AuthConfig {
  authenticators: Authenticator[];
  /** Turn a `?ticket=` into a session cookie; run on every path, before the guard. */
  exchanges: RequestHandler[];
  middleware?: RequestHandler;
  scope: 'all' | 'api';
  csrf: boolean;
  loginUrl?: AuthCommonOptions['loginUrl'];
  onUnauthorized?: AuthCommonOptions['onUnauthorized'];
}

function normalize(options: AgendashAuthOptions | undefined): AuthConfig | undefined {
  if (!options || ('type' in options && options.type === 'none')) {
    return undefined;
  }

  const common: AuthCommonOptions = options;
  const strategies: AgendashAuthStrategy[] = 'strategies' in options ? options.strategies : [options];
  if (!Array.isArray(strategies) || strategies.length === 0) {
    throw configError('`strategies` must be a non-empty array');
  }

  const authenticators: Authenticator[] = [];
  const exchanges: RequestHandler[] = [];
  let middleware: RequestHandler | undefined;
  for (const strategy of strategies) {
    if (strategy?.type === 'ticket') {
      const { authenticator, exchange } = createTicketStrategy(strategy);
      authenticators.push(authenticator);
      exchanges.push(exchange);
    } else if (strategy?.type === 'custom' && strategy.middleware !== undefined) {
      if (typeof strategy.middleware !== 'function') {
        throw configError('custom `middleware` must be a function');
      }
      if (strategy.verify !== undefined) {
        throw configError('custom takes either `verify` or `middleware`, not both');
      }
      if (middleware) {
        throw configError('only one custom `middleware` strategy is supported');
      }
      middleware = strategy.middleware;
    } else {
      authenticators.push(createAuthenticator(strategy));
    }
  }

  const scope = common.scope ?? (strategies.every((strategy) => strategy.type === 'apiKey') ? 'api' : 'all');
  if (scope !== 'all' && scope !== 'api') {
    throw configError('`scope` must be "all" or "api"');
  }

  return {
    authenticators,
    exchanges,
    middleware,
    scope,
    csrf: common.csrf ?? true,
    loginUrl: common.loginUrl,
    onUnauthorized: common.onUnauthorized,
  };
}

function allow(
  config: AuthConfig,
  { strategy, ambient, principal }: { strategy: AgendashAuthInfo['strategy']; ambient: boolean; principal: unknown },
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (ambient && config.csrf && !SAFE_METHODS.has(req.method) && !req.get('x-requested-with')) {
    res.status(403).json({ error: 'Forbidden', message: 'Missing X-Requested-With header' });
    return;
  }
  authInfo.set(req, { strategy, principal: principal === true ? undefined : principal });
  next();
}

/** What a browser opening a protected page without credentials sees, instead of a JSON error. */
function signInRequiredPage(framed: boolean): string {
  const frameNote = framed
    ? '<p>The dashboard is shown inside another page, and your browser may block the cookie that keeps you signed in ' +
      'there. Opening it in a new tab from your application should work.</p>'
    : '';
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Agendash</title></head>' +
    `<body><h1>Sign-in required</h1><p>Open Agendash again from your application.</p>${frameNote}</body></html>`
  );
}

function reject(config: AuthConfig, req: Request, res: Response, next: NextFunction) {
  if (config.onUnauthorized) {
    config.onUnauthorized(req, res, next);
    return;
  }

  const loginUrl = typeof config.loginUrl === 'function' ? config.loginUrl(req) : config.loginUrl;
  const browserPage = req.method === 'GET' && req.accepts(['json', 'html']) === 'html';
  if (loginUrl && browserPage) {
    res.redirect(302, loginUrl);
    return;
  }

  const challenge = config.authenticators.find((authenticator) => authenticator.challenge)?.challenge;
  if (challenge) {
    res.set('WWW-Authenticate', challenge);
  }
  if (browserPage) {
    const dest = req.get('sec-fetch-dest');
    res.status(401).type('html').send(signInRequiredPage(dest === 'iframe' || dest === 'frame'));
    return;
  }
  const auth: Record<string, unknown> = {
    strategies: [
      ...config.authenticators.map((authenticator) => authenticator.type),
      ...(config.middleware ? ['custom'] : []),
    ],
    loginUrl: loginUrl ?? null,
  };
  for (const authenticator of config.authenticators) {
    Object.assign(auth, authenticator.hint);
  }
  res.status(401).json({ error: 'Unauthorized', message: 'Authentication required', auth });
}

async function authorize(config: AuthConfig, req: Request, res: Response, next: NextFunction) {
  for (const authenticator of config.authenticators) {
    const principal = await authenticator.authenticate(req, res);
    if (principal) {
      allow(config, { strategy: authenticator.type, ambient: authenticator.ambient, principal }, req, res, next);
      return;
    }
  }

  if (!config.middleware) {
    reject(config, req, res, next);
    return;
  }

  // The host middleware accepts by calling next() and answers the request itself otherwise.
  await config.middleware(req, res, (err?: unknown) => {
    if (err === 'route' || err === 'router') {
      // Would skip the remaining guard and reach the dashboard routes: treat as a rejection.
      reject(config, req, res, next);
    } else if (err) {
      next(err);
    } else {
      allow(config, { strategy: 'custom', ambient: true, principal: undefined }, req, res, next);
    }
  });
}

/**
 * Express middleware enforcing the `auth` option. Mount it before the dashboard's routes;
 * it does nothing when `auth` is missing or `{ type: 'none' }`.
 * Invalid options throw immediately, so a misconfiguration never leaves the dashboard open.
 */
export function createAuthMiddleware(options?: AgendashAuthOptions): RequestHandler {
  const config = normalize(options);
  if (!config) {
    return passThrough;
  }

  const guard: RequestHandler = (req, res, next) => {
    authorize(config, req, res, next).catch(next);
  };
  // A router matches paths exactly like the dashboard's own routes (case-insensitively), so "/API" is guarded too.
  const router = express.Router();
  for (const exchange of config.exchanges) {
    router.use(exchange);
  }
  if (config.scope === 'api') {
    router.use('/api', guard);
  } else {
    router.use(guard);
  }
  return router;
}

export async function isReadOnly(readOnly: AgendashReadOnlyOption | undefined, req: Request): Promise<boolean> {
  return typeof readOnly === 'function' ? Boolean(await readOnly(req)) : Boolean(readOnly);
}

/**
 * Express middleware enforcing the `readOnly` option: every state-changing request
 * (create, requeue, delete) is refused with 403. Mount it after the auth middleware,
 * so a `readOnly(req)` function can look at the authenticated user.
 */
export function createReadOnlyGuard(readOnly?: AgendashReadOnlyOption): RequestHandler {
  if (!readOnly) {
    return passThrough;
  }
  if (readOnly !== true && typeof readOnly !== 'function') {
    throw new Error('Agendash: `readOnly` must be a boolean or a function');
  }

  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    isReadOnly(readOnly, req).then((blocked) => {
      if (blocked) {
        res.status(403).json({ error: 'Forbidden', message: 'Agendash is in read-only mode' });
      } else {
        next();
      }
    }, next);
  };
}

/** `GET /config`, mounted under `/api`: what the UI needs to know about the current user. */
export function createConfigRouter(options: { readOnly?: AgendashReadOnlyOption }): express.Router {
  const router = express.Router();
  router.get('/config', (req, res, next) => {
    isReadOnly(options.readOnly, req).then((readOnly) => {
      res.json({ readOnly });
    }, next);
  });
  return router;
}
