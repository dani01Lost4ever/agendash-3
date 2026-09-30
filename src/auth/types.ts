import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type Awaitable<T> = T | Promise<T>;

/**
 * Result of a host-supplied verify function: any truthy value accepts the request,
 * a falsy value or a thrown error rejects it. This lets hosts pass functions such as
 * `(token) => jwt.verify(token, secret)` directly.
 */
export type VerifyResult = Awaitable<unknown>;

/** Authentication disabled (the default when no `auth` option is given). */
export interface NoAuthStrategy {
  type: 'none';
}

/** API key sent in a header (default `X-API-Key`), as `Authorization: Bearer <key>`, or in the query string. */
export interface ApiKeyAuthStrategy {
  type: 'apiKey';
  /** Accepted key(s). Required unless `verify` is given. */
  keys?: string | string[];
  /** Custom key check, e.g. a database lookup. Used instead of `keys`. */
  verify?: (key: string, req: Request) => VerifyResult;
  /** Header carrying the key. Default `x-api-key`; `false` disables it. */
  header?: string | false;
  /** Accept `Authorization: Bearer <key>`. Default `true`. */
  bearer?: boolean;
  /** Query-string parameter carrying the key. Disabled by default because URLs end up in logs. */
  queryParam?: string | false;
}

/** A cookie set by the host application (e.g. a session id or a JWT), validated by the host. */
export interface CookieAuthStrategy {
  type: 'cookie';
  /** Cookie name. */
  name: string;
  /** Validates the cookie value. */
  verify: (value: string, req: Request) => VerifyResult;
  /** Read the value from `req.signedCookies` (requires `cookie-parser` with a secret in the host app). */
  signed?: boolean;
}

/** HTTP Basic authentication; browsers show their native login prompt. */
export interface BasicAuthStrategy {
  type: 'basic';
  /** Accepted `username: password` pairs. Required unless `verify` is given. */
  users?: Record<string, string>;
  /** Custom credential check. Used instead of `users`. */
  verify?: (username: string, password: string, req: Request) => VerifyResult;
  /** Realm shown by the browser prompt. Default `Agendash`. */
  realm?: string;
}

/**
 * Anything else, decided by the host: either a `verify(req, res)` function
 * (e.g. `(req) => req.user?.isAdmin`) or an Express middleware (e.g. passport)
 * that calls `next()` when the request is allowed and answers the request itself otherwise.
 */
export interface CustomAuthStrategy {
  type: 'custom';
  verify?: (req: Request, res: Response) => VerifyResult;
  middleware?: RequestHandler;
}

export type AgendashAuthStrategy =
  | ApiKeyAuthStrategy
  | CookieAuthStrategy
  | BasicAuthStrategy
  | CustomAuthStrategy;

export interface AuthCommonOptions {
  /**
   * What is protected: `'all'` (dashboard and API) or `'api'` (API only; the static UI stays public
   * and shows its own login screen). Default `'api'` when every strategy is `apiKey`, `'all'` otherwise.
   */
  scope?: 'all' | 'api';
  /** Where browsers are redirected when they open the dashboard unauthenticated (e.g. the host's login page). */
  loginUrl?: string | ((req: Request) => string);
  /**
   * Require the `X-Requested-With` header on state-changing requests authenticated through
   * credentials the browser sends by itself (cookie, basic, custom), which blocks cross-site
   * request forgery. Default `true`. The dashboard UI always sends the header.
   */
  csrf?: boolean;
  /** Replaces the default 401 response. */
  onUnauthorized?: (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * The `auth` option: a single strategy, or several combined with `strategies`
 * (a request is accepted as soon as one of them accepts it).
 */
export type AgendashAuthOptions =
  | NoAuthStrategy
  | (AgendashAuthStrategy & AuthCommonOptions)
  | (AuthCommonOptions & { strategies: AgendashAuthStrategy[] });

/**
 * The `readOnly` option: `true` rejects every request that would change jobs (create, requeue,
 * delete); a function decides per request, e.g. `(req) => !req.user?.isAdmin`.
 */
export type AgendashReadOnlyOption = boolean | ((req: Request) => Awaitable<boolean>);
