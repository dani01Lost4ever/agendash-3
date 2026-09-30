import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { Request, RequestHandler } from 'express';

import { Authenticator, accepts, configError, readCookieHeader } from './strategies';
import type { TicketAuthStrategy } from './types';

const DEFAULT_MAX_AGE_SECONDS = 8 * 60 * 60;
// Longer than any sensible ticket lifetime, so a leaked ticket cannot be replayed on this process.
const USED_TICKET_MEMORY_MS = 10 * 60 * 1000;
const MAX_REMEMBERED_TICKETS = 10_000;
// Browsers drop cookies over 4096 bytes.
const MAX_COOKIE_VALUE_LENGTH = 3800;
const SAME_SITE_VALUES = new Set(['strict', 'lax', 'none']);

interface SessionPayload {
  /** Expiry, in seconds since the epoch. */
  exp: number;
  /** Plain object returned by verifyTicket, if any. */
  p?: Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * `?ticket=` exchange plus the session cookie check. The exchange runs on every path, the check is
 * an ordinary authenticator.
 */
export function createTicketStrategy(strategy: TicketAuthStrategy): { authenticator: Authenticator; exchange: RequestHandler } {
  const { verifyTicket, queryParam = 'ticket', session } = strategy;
  if (typeof verifyTicket !== 'function') {
    throw configError('ticket needs a `verifyTicket` function');
  }
  if (typeof queryParam !== 'string' || queryParam.length === 0) {
    throw configError('ticket `queryParam` must be a non-empty string');
  }
  if (!session || typeof session.secret !== 'string' || session.secret.length < 32) {
    throw configError('ticket needs `session.secret`, at least 32 characters long');
  }
  const {
    secret,
    name = 'agendash_session',
    maxAge = DEFAULT_MAX_AGE_SECONDS,
    sameSite = 'none',
    secure = true,
    partitioned = sameSite === 'none',
    path,
    domain,
  } = session;
  if (typeof name !== 'string' || name.length === 0) {
    throw configError('ticket `session.name` must be a non-empty string');
  }
  if (typeof maxAge !== 'number' || !(maxAge > 0)) {
    throw configError('ticket `session.maxAge` must be a positive number of seconds');
  }
  if (!SAME_SITE_VALUES.has(sameSite)) {
    throw configError('ticket `session.sameSite` must be "strict", "lax" or "none"');
  }
  if (sameSite === 'none' && !secure) {
    throw configError('ticket `session.sameSite: "none"` requires `secure: true`, or browsers drop the cookie');
  }

  const sign = (body: string) => createHmac('sha256', secret).update(body).digest();

  const encode = (principal: unknown): string => {
    const payload: SessionPayload = { exp: Math.floor(Date.now() / 1000) + maxAge };
    if (isPlainObject(principal)) {
      payload.p = principal;
    }
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${sign(body).toString('base64url')}`;
  };

  const decode = (value: string): unknown => {
    const separator = value.indexOf('.');
    if (separator < 0) return false;
    const body = value.slice(0, separator);
    const signature = Buffer.from(value.slice(separator + 1), 'base64url');
    const expected = sign(body);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
      return false;
    }
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
      if (!(payload.exp > Date.now() / 1000)) return false;
      return payload.p ?? true;
    } catch {
      return false;
    }
  };

  const usedTickets = new Map<string, number>();
  /** Returns false when the ticket was already presented to this process. */
  const consume = (ticket: string): boolean => {
    const now = Date.now();
    for (const [digest, expiresAt] of usedTickets) {
      if (expiresAt > now && usedTickets.size < MAX_REMEMBERED_TICKETS) break;
      usedTickets.delete(digest);
    }
    const digest = createHash('sha256').update(ticket).digest('base64');
    if (usedTickets.has(digest)) return false;
    usedTickets.set(digest, now + USED_TICKET_MEMORY_MS);
    return true;
  };

  const authenticator: Authenticator = {
    type: 'ticket',
    ambient: true,
    authenticate: (req) => {
      const value =
        ((req.cookies as Record<string, unknown> | undefined)?.[name] as string | undefined) ??
        readCookieHeader(req.headers.cookie, name);
      return Promise.resolve(typeof value === 'string' && value ? decode(value) : false);
    },
  };

  /** Where to send the browser once the ticket is used: the same URL without it, relative to survive proxies. */
  const cleanUrl = (req: Request): string => {
    const url = new URL(req.originalUrl, 'http://agendash.invalid');
    url.searchParams.delete(queryParam);
    const lastSegment = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    return `./${lastSegment}${url.search}`;
  };

  const exchange: RequestHandler = (req, res, next) => {
    const ticket = (req.query as Record<string, unknown>)[queryParam];
    if ((req.method !== 'GET' && req.method !== 'HEAD') || typeof ticket !== 'string' || !ticket) {
      next();
      return;
    }
    const verify = consume(ticket) ? accepts(() => verifyTicket(ticket, req)) : Promise.resolve(false);
    verify
      .then((principal) => {
        if (principal) {
          const value = encode(principal);
          if (value.length > MAX_COOKIE_VALUE_LENGTH) {
            throw configError('the object returned by `verifyTicket` is too large for the session cookie');
          }
          res.cookie(name, value, {
            httpOnly: true,
            secure,
            sameSite,
            partitioned,
            path: path ?? (req.baseUrl || '/'),
            domain,
            maxAge: maxAge * 1000,
          });
        }
        // An invalid or reused ticket is dropped from the URL too; the session cookie, if any, decides.
        res.setHeader('Cache-Control', 'no-store');
        res.redirect(302, cleanUrl(req));
      })
      .catch(next);
  };

  return { authenticator, exchange };
}
