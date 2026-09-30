import { createHash, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import type {
  AgendashAuthStrategy,
  ApiKeyAuthStrategy,
  BasicAuthStrategy,
  CookieAuthStrategy,
  CustomAuthStrategy,
  TicketAuthStrategy,
  VerifyResult,
} from './types';

export interface Authenticator {
  type: AgendashAuthStrategy['type'];
  /** The browser attaches these credentials on its own, so state-changing requests need CSRF protection. */
  ambient: boolean;
  /** `WWW-Authenticate` value sent with 401 responses. */
  challenge?: string;
  /** Non-secret details the dashboard UI needs to authenticate (sent with 401 responses). */
  hint?: Record<string, unknown>;
  /** Resolves to a falsy value to reject, or to the principal (`true` when there is none). */
  authenticate(req: Request, res: Response): Promise<unknown>;
}

export function configError(message: string): Error {
  return new Error(`Agendash auth: ${message}`);
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Compares `value` with every candidate in constant time, so timing reveals neither the match nor its position. */
function matchesAny(value: string, candidates: Buffer[]): boolean {
  const hashed = digest(value);
  let found = false;
  for (const candidate of candidates) {
    found = timingSafeEqual(hashed, candidate) || found;
  }
  return found;
}

/** Runs a host verify function: its truthy result is the principal, a throw is a rejection. */
export async function accepts(check: () => VerifyResult): Promise<unknown> {
  try {
    return await check();
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function apiKeyAuthenticator(strategy: ApiKeyAuthStrategy): Authenticator {
  const header = strategy.header === undefined ? 'x-api-key' : strategy.header;
  const bearer = strategy.bearer ?? true;
  const queryParam = strategy.queryParam ?? false;
  if (!header && !bearer && !queryParam) {
    throw configError('apiKey needs at least one of `header`, `bearer` or `queryParam` enabled');
  }

  let verify: (key: string, req: Request) => VerifyResult;
  if (strategy.verify !== undefined) {
    if (strategy.keys !== undefined) {
      throw configError('apiKey takes either `keys` or `verify`, not both');
    }
    if (typeof strategy.verify !== 'function') {
      throw configError('apiKey `verify` must be a function');
    }
    verify = strategy.verify;
  } else {
    // A missing environment variable must not silently turn authentication off.
    const keys: unknown[] = Array.isArray(strategy.keys) ? strategy.keys : [strategy.keys];
    if (keys.length === 0 || !keys.every(isNonEmptyString)) {
      throw configError('apiKey needs non-empty `keys` or a `verify` function');
    }
    const digests = keys.map(digest);
    verify = (key) => matchesAny(key, digests);
  }

  const readKey = (req: Request): string | undefined => {
    if (header) {
      const value = req.get(header);
      if (value) return value;
    }
    if (bearer) {
      const match = /^Bearer\s+(\S+)\s*$/i.exec(req.get('authorization') ?? '');
      if (match) return match[1];
    }
    if (queryParam) {
      const value = (req.query as Record<string, unknown>)[queryParam];
      if (isNonEmptyString(value)) return value;
    }
    return undefined;
  };

  return {
    type: 'apiKey',
    ambient: false,
    hint: { apiKey: { header: header || null, bearer } },
    authenticate: async (req) => {
      const key = readKey(req);
      return key ? accepts(() => verify(key, req)) : false;
    },
  };
}

export function readCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    let value = part.slice(index + 1).trim();
    if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

function cookieAuthenticator(strategy: CookieAuthStrategy): Authenticator {
  const { name, verify, signed = false } = strategy;
  if (!isNonEmptyString(name)) {
    throw configError('cookie needs a `name`');
  }
  if (typeof verify !== 'function') {
    throw configError('cookie needs a `verify` function');
  }

  const readCookie = (req: Request): string | undefined => {
    if (signed) {
      // cookie-parser sets tampered signed cookies to `false`.
      const value = (req.signedCookies as Record<string, unknown> | undefined)?.[name];
      return isNonEmptyString(value) ? value : undefined;
    }
    const parsed = (req.cookies as Record<string, unknown> | undefined)?.[name];
    if (isNonEmptyString(parsed)) return parsed;
    return readCookieHeader(req.headers.cookie, name);
  };

  return {
    type: 'cookie',
    ambient: true,
    authenticate: async (req) => {
      const value = readCookie(req);
      return value ? accepts(() => verify(value, req)) : false;
    },
  };
}

function basicAuthenticator(strategy: BasicAuthStrategy): Authenticator {
  const realm = (strategy.realm ?? 'Agendash').replace(/["\\]/g, '');

  let verify: (username: string, password: string, req: Request) => VerifyResult;
  if (strategy.verify !== undefined) {
    if (strategy.users !== undefined) {
      throw configError('basic takes either `users` or `verify`, not both');
    }
    if (typeof strategy.verify !== 'function') {
      throw configError('basic `verify` must be a function');
    }
    verify = strategy.verify;
  } else {
    const users = Object.entries(strategy.users ?? {});
    if (users.length === 0 || !users.every(([username, password]) => isNonEmptyString(username) && isNonEmptyString(password))) {
      throw configError('basic needs non-empty `users` or a `verify` function');
    }
    const digests = users.map(([username, password]) => [digest(username), digest(password)]);
    verify = (username, password) => {
      const hashedUsername = digest(username);
      const hashedPassword = digest(password);
      let found = false;
      for (const [expectedUsername, expectedPassword] of digests) {
        const usernameMatches = timingSafeEqual(hashedUsername, expectedUsername);
        const passwordMatches = timingSafeEqual(hashedPassword, expectedPassword);
        found = (usernameMatches && passwordMatches) || found;
      }
      return found;
    };
  }

  const readCredentials = (req: Request) => {
    const match = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(req.get('authorization') ?? '');
    if (!match) return undefined;
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return undefined;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  };

  return {
    type: 'basic',
    ambient: true,
    challenge: `Basic realm="${realm}", charset="UTF-8"`,
    authenticate: async (req) => {
      const credentials = readCredentials(req);
      return credentials ? accepts(() => verify(credentials.username, credentials.password, req)) : false;
    },
  };
}

function customAuthenticator(strategy: CustomAuthStrategy): Authenticator {
  const { verify } = strategy;
  if (typeof verify !== 'function') {
    throw configError('custom needs a `verify` function or a `middleware`');
  }
  return {
    type: 'custom',
    ambient: true,
    authenticate: (req, res) => accepts(() => verify(req, res)),
  };
}

/** Builds the check for one strategy. A custom `middleware` strategy is run by the guard itself, not here. */
export function createAuthenticator(strategy: Exclude<AgendashAuthStrategy, TicketAuthStrategy>): Authenticator {
  switch (strategy?.type) {
    case 'apiKey':
      return apiKeyAuthenticator(strategy);
    case 'cookie':
      return cookieAuthenticator(strategy);
    case 'basic':
      return basicAuthenticator(strategy);
    case 'custom':
      return customAuthenticator(strategy);
    default:
      throw configError(`unknown strategy type "${String((strategy as { type?: unknown })?.type)}"`);
  }
}
