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

/**
 * A one-time ticket exchanged for a session cookie, for a dashboard embedded in an iframe of the host
 * application (an iframe cannot send an `Authorization` header). The host signs a short-lived ticket,
 * e.g. a 60-second JWT, and points the iframe at `<mount path>/?ticket=<ticket>`. Agendash checks it
 * with `verifyTicket`, sets a signed HttpOnly session cookie and redirects to the same URL without the
 * ticket. A ticket is accepted once per process.
 */
export interface TicketAuthStrategy {
  type: 'ticket';
  /**
   * Checks the ticket, e.g. `(ticket) => jwt.verify(ticket, secret, { audience: 'agendash' })`.
   * A plain object it returns (such as the JWT payload) is kept in the session and available to
   * `readOnly(req)` through `getAgendashAuth(req).principal`, so keep it small.
   */
  verifyTicket: (ticket: string, req: Request) => VerifyResult;
  /** Query-string parameter carrying the ticket. Default `ticket`. */
  queryParam?: string;
  /** The session cookie set after a valid ticket. */
  session: SessionCookieOptions;
}

export interface SessionCookieOptions {
  /** Signs the cookie with HMAC-SHA256. At least 32 characters; keep it out of the source code. */
  secret: string;
  /** Default `agendash_session`. */
  name?: string;
  /** Session lifetime in seconds. Default 8 hours. */
  maxAge?: number;
  /**
   * Default `'none'`, required when the host application that frames the dashboard is on another
   * site. Use `'lax'` or `'strict'` when the dashboard is served from the same site.
   */
  sameSite?: 'strict' | 'lax' | 'none';
  /** Default `true`; `sameSite: 'none'` requires it. */
  secure?: boolean;
  /**
   * Partitioned cookie (CHIPS): keeps working in a cross-site iframe when the browser blocks
   * third-party cookies. Default `true` when `sameSite` is `'none'`.
   */
  partitioned?: boolean;
  /** Default: the path Agendash is mounted on. */
  path?: string;
  domain?: string;
}

export type AgendashAuthStrategy =
  | ApiKeyAuthStrategy
  | CookieAuthStrategy
  | BasicAuthStrategy
  | CustomAuthStrategy
  | TicketAuthStrategy;

/** Who was let in, as returned by `getAgendashAuth(req)`. */
export interface AgendashAuthInfo {
  /** The strategy that accepted the request. */
  strategy: AgendashAuthStrategy['type'];
  /**
   * What its verify function returned (e.g. the JWT payload), or the plain object kept in a ticket
   * session. `undefined` for `keys` and `users` lists and custom middleware.
   */
  principal?: unknown;
}

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
   * credentials the browser sends by itself (cookie, ticket, basic, custom), which blocks cross-site
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
