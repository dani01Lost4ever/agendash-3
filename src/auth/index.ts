import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Authenticator, configError, createAuthenticator } from './strategies';
import type {
  AgendashAuthOptions,
  AgendashAuthStrategy,
  AgendashReadOnlyOption,
  AuthCommonOptions,
} from './types';

export * from './types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const passThrough: RequestHandler = (_req, _res, next) => next();

interface AuthConfig {
  authenticators: Authenticator[];
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
  let middleware: RequestHandler | undefined;
  for (const strategy of strategies) {
    if (strategy?.type === 'custom' && strategy.middleware !== undefined) {
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
    middleware,
    scope,
    csrf: common.csrf ?? true,
    loginUrl: common.loginUrl,
    onUnauthorized: common.onUnauthorized,
  };
}

function allow(config: AuthConfig, ambient: boolean, req: Request, res: Response, next: NextFunction) {
  if (ambient && config.csrf && !SAFE_METHODS.has(req.method) && !req.get('x-requested-with')) {
    res.status(403).json({ error: 'Forbidden', message: 'Missing X-Requested-With header' });
    return;
  }
  next();
}

function reject(config: AuthConfig, req: Request, res: Response, next: NextFunction) {
  if (config.onUnauthorized) {
    config.onUnauthorized(req, res, next);
    return;
  }

  const loginUrl = typeof config.loginUrl === 'function' ? config.loginUrl(req) : config.loginUrl;
  if (loginUrl && req.method === 'GET' && req.accepts(['json', 'html']) === 'html') {
    res.redirect(302, loginUrl);
    return;
  }

  const challenge = config.authenticators.find((authenticator) => authenticator.challenge)?.challenge;
  if (challenge) {
    res.set('WWW-Authenticate', challenge);
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
    if (await authenticator.authenticate(req, res)) {
      allow(config, authenticator.ambient, req, res, next);
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
      allow(config, true, req, res, next);
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
