import assert from 'node:assert/strict';
import express from 'express';
import type { Express } from 'express';
import supertest from 'supertest';

import Agendash, { type AgendashInstance } from '../src';
import { createHmac } from 'node:crypto';

import {
  AgendashAuthOptions,
  AgendashReadOnlyOption,
  createAuthMiddleware,
  createReadOnlyGuard,
  getAgendashAuth,
} from '../src/auth';
import { startAgenda, stopAgenda, type TestContext } from './helpers';

/** A host app mounting a stand-in dashboard at /dash, guarded exactly like the real one. */
function dashboard(
  auth?: AgendashAuthOptions,
  { readOnly, before }: { readOnly?: AgendashReadOnlyOption; before?: (host: Express) => void } = {},
) {
  const host = express();
  before?.(host);

  const dash = express();
  dash.use(createAuthMiddleware(auth));
  dash.use(createReadOnlyGuard(readOnly));
  dash.get('/index.html', (_req, res) => {
    res.send('<html></html>');
  });
  dash.get('/api', (_req, res) => {
    res.json({ ok: true });
  });
  dash.post('/api/jobs/delete', (_req, res) => {
    res.json({ deleted: true });
  });

  host.use('/dash', dash);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  host.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return supertest(host);
}

function basic(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('auth', () => {
  describe('configuration', () => {
    it('is off by default and with type none', async () => {
      await dashboard().get('/dash/api').expect(200);
      await dashboard({ type: 'none' }).post('/dash/api/jobs/delete').expect(200);
    });

    it('rejects configurations that would leave the dashboard open or are ambiguous', () => {
      const invalid: unknown[] = [
        { type: 'apiKey' },
        { type: 'apiKey', keys: undefined },
        { type: 'apiKey', keys: [] },
        { type: 'apiKey', keys: ['ok', ''] },
        { type: 'apiKey', keys: 'k', verify: () => true },
        { type: 'apiKey', keys: 'k', header: false, bearer: false },
        { type: 'cookie', name: 'session' },
        { type: 'cookie', verify: () => true },
        { type: 'basic' },
        { type: 'basic', users: { admin: '' } },
        { type: 'custom' },
        { type: 'custom', verify: () => true, middleware: () => undefined },
        { type: 'magic' },
        { strategies: [] },
        { strategies: [{ type: 'none' }] },
        { type: 'apiKey', keys: 'k', scope: 'everything' },
      ];
      for (const options of invalid) {
        assert.throws(() => createAuthMiddleware(options as AgendashAuthOptions), /Agendash auth/, JSON.stringify(options));
      }
      assert.throws(() => createReadOnlyGuard('yes' as unknown as boolean), /readOnly/);
    });
  });

  describe('apiKey', () => {
    const request = dashboard({ type: 'apiKey', keys: ['first-key', 'second-key'] });

    it('protects only the API by default, so the UI can show its login screen', async () => {
      await request.get('/dash/index.html').expect(200);
      const response = await request.get('/dash/api').expect(401);
      assert.deepEqual(response.body, {
        error: 'Unauthorized',
        message: 'Authentication required',
        auth: { strategies: ['apiKey'], loginUrl: null, apiKey: { header: 'x-api-key', bearer: true } },
      });
    });

    it('accepts any configured key from the header or as a bearer token', async () => {
      await request.get('/dash/api').set('X-API-Key', 'first-key').expect(200);
      await request.get('/dash/api').set('Authorization', 'Bearer second-key').expect(200);
      await request.get('/dash/api').set('X-API-Key', 'wrong-key').expect(401);
      await request.get('/dash/api').set('Authorization', 'Bearer first-key-and-more').expect(401);
    });

    it('guards API paths whatever their case', async () => {
      await request.get('/dash/API').expect(401);
      await request.post('/dash/Api/jobs/delete').expect(401);
    });

    it('does not require the CSRF header, since browsers never send the key on their own', async () => {
      await request.post('/dash/api/jobs/delete').set('X-API-Key', 'first-key').expect(200);
    });

    it('reads the query string only when enabled', async () => {
      await request.get('/dash/api?apiKey=first-key').expect(401);
      const withQuery = dashboard({ type: 'apiKey', keys: 'first-key', queryParam: 'apiKey' });
      await withQuery.get('/dash/api?apiKey=first-key').expect(200);
    });

    it('supports a custom header, disabling bearer tokens and a verify function', async () => {
      const custom = dashboard({
        type: 'apiKey',
        header: 'X-Agendash-Token',
        bearer: false,
        verify: (key) => Promise.resolve(key === 'from-db'),
      });
      await custom.get('/dash/api').set('X-Agendash-Token', 'from-db').expect(200);
      await custom.get('/dash/api').set('Authorization', 'Bearer from-db').expect(401);
      await custom.get('/dash/api').set('X-API-Key', 'from-db').expect(401);
    });

    it('treats a throwing verify function as a rejection', async () => {
      const throwing = dashboard({
        type: 'apiKey',
        verify: () => {
          throw new Error('invalid');
        },
      });
      await throwing.get('/dash/api').set('X-API-Key', 'anything').expect(401);
    });
  });

  describe('cookie', () => {
    const options: AgendashAuthOptions = {
      type: 'cookie',
      name: 'agendash_session',
      verify: (value) => {
        if (value !== 'valid token') throw new Error('jwt malformed');
        return { user: 'admin' };
      },
      loginUrl: '/login',
    };
    const request = dashboard(options);

    it('protects the whole dashboard and sends browsers to the login page', async () => {
      await request.get('/dash/index.html').set('Accept', 'text/html').expect(302).expect('Location', '/login');
      const response = await request.get('/dash/api').set('Accept', 'application/json').expect(401);
      assert.equal(response.body.auth.loginUrl, '/login');
    });

    it('accepts a cookie the verify function approves', async () => {
      await request.get('/dash/api').set('Cookie', 'other=1; agendash_session=valid%20token').expect(200);
      await request.get('/dash/api').set('Cookie', 'agendash_session=forged').expect(401);
    });

    it('requires X-Requested-With on state-changing requests', async () => {
      const cookie = 'agendash_session=valid%20token';
      const blocked = await request.post('/dash/api/jobs/delete').set('Cookie', cookie).expect(403);
      assert.equal(blocked.body.message, 'Missing X-Requested-With header');
      await request.post('/dash/api/jobs/delete').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest').expect(200);

      const withoutCsrf = dashboard({ ...options, csrf: false });
      await withoutCsrf.post('/dash/api/jobs/delete').set('Cookie', cookie).expect(200);
    });

    it('reads signed cookies parsed by the host', async () => {
      const signed = dashboard(
        { type: 'cookie', name: 'sid', signed: true, verify: (value) => value === 'abc' },
        {
          before: (host) =>
            host.use((req, _res, next) => {
              req.signedCookies = { sid: req.get('x-test-signed') === 'yes' ? 'abc' : false };
              next();
            }),
        },
      );
      await signed.get('/dash/api').set('x-test-signed', 'yes').expect(200);
      await signed.get('/dash/api').set('Cookie', 'sid=abc').expect(401);
    });
  });

  describe('basic', () => {
    const request = dashboard({ type: 'basic', users: { admin: 'pa:ss' }, realm: 'Jobs' });

    it('challenges the browser and checks the credentials', async () => {
      await request.get('/dash/index.html').expect(401).expect('WWW-Authenticate', 'Basic realm="Jobs", charset="UTF-8"');
      await request.get('/dash/index.html').set('Authorization', basic('admin', 'pa:ss')).expect(200);
      await request.get('/dash/api').set('Authorization', basic('admin', 'wrong')).expect(401);
      await request.get('/dash/api').set('Authorization', basic('root', 'pa:ss')).expect(401);
    });
  });

  describe('custom', () => {
    type WithUser = express.Request & { user?: { isAdmin: boolean } };
    const setUser = (host: Express) =>
      host.use((req: WithUser, _res, next) => {
        const role = req.get('x-test-role');
        req.user = role ? { isAdmin: role === 'admin' } : undefined;
        next();
      });

    it('accepts requests the verify function approves', async () => {
      const request = dashboard(
        { type: 'custom', verify: (req: WithUser) => req.user?.isAdmin },
        { before: setUser },
      );
      await request.get('/dash/api').set('x-test-role', 'admin').expect(200);
      await request.get('/dash/api').set('x-test-role', 'viewer').expect(401);
    });

    it('delegates to a host middleware', async () => {
      const request = dashboard({
        type: 'custom',
        middleware: (req, res, next) => {
          const outcome = req.get('x-test-outcome');
          if (outcome === 'allow') next();
          else if (outcome === 'error') next(new Error('session store down'));
          else if (outcome === 'skip') next('router');
          else res.status(418).send('go away');
        },
      });
      await request.get('/dash/api').set('x-test-outcome', 'allow').expect(200);
      await request.get('/dash/api').expect(418);
      await request.get('/dash/api').set('x-test-outcome', 'error').expect(500);
      // next('router') must not jump past the guard to the dashboard routes.
      await request.get('/dash/api').set('x-test-outcome', 'skip').expect(401);
    });
  });

  describe('combined strategies', () => {
    const request = dashboard({
      strategies: [
        { type: 'cookie', name: 'sid', verify: (value) => value === 'abc' },
        { type: 'apiKey', keys: 'service-key' },
      ],
      onUnauthorized: (_req, res) => {
        res.status(401).send('nope');
      },
    });

    it('accepts a request as soon as one strategy accepts it', async () => {
      await request.get('/dash/api').set('Cookie', 'sid=abc').expect(200);
      await request.get('/dash/api').set('X-API-Key', 'service-key').expect(200);
      await request.post('/dash/api/jobs/delete').set('X-API-Key', 'service-key').expect(200);
    });

    it('protects the whole dashboard and uses the custom rejection', async () => {
      const response = await request.get('/dash/index.html').expect(401);
      assert.equal(response.text, 'nope');
    });
  });

  describe('ticket', () => {
    const secret = 'a-session-secret-of-at-least-32-chars';
    const options: AgendashAuthOptions = {
      type: 'ticket',
      verifyTicket: (ticket) => {
        if (!ticket.startsWith('valid-')) throw new Error('jwt expired');
        return { sub: ticket.slice('valid-'.length), role: ticket.endsWith('admin') ? 'admin' : 'viewer' };
      },
      session: { secret },
    };
    const readOnly = (req: express.Request) => (getAgendashAuth(req)?.principal as { role?: string } | undefined)?.role !== 'admin';

    function sessionCookie(response: supertest.Response): string | undefined {
      const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
      return cookies?.find((cookie) => cookie.startsWith('agendash_session='));
    }

    it('rejects configurations that would weaken the session', () => {
      const invalid: unknown[] = [
        { type: 'ticket', session: { secret } },
        { type: 'ticket', verifyTicket: () => true },
        { type: 'ticket', verifyTicket: () => true, session: { secret: 'too-short' } },
        { type: 'ticket', verifyTicket: () => true, session: { secret, secure: false } },
        { type: 'ticket', verifyTicket: () => true, session: { secret, sameSite: 'relaxed' } },
        { type: 'ticket', verifyTicket: () => true, session: { secret, maxAge: 0 } },
      ];
      for (const invalidOptions of invalid) {
        assert.throws(() => createAuthMiddleware(invalidOptions as AgendashAuthOptions), /Agendash auth/, JSON.stringify(invalidOptions));
      }
    });

    it('swaps a valid ticket for a session cookie and removes it from the URL', async () => {
      const request = dashboard(options);
      const response = await request.get('/dash/?jobType=failed&ticket=valid-ada').expect(302);
      assert.equal(response.headers.location, './?jobType=failed');
      assert.equal(response.headers['cache-control'], 'no-store');
      const cookie = sessionCookie(response);
      assert.ok(cookie, 'session cookie set');
      for (const attribute of ['HttpOnly', 'Secure', 'SameSite=None', 'Partitioned', 'Path=/dash', 'Max-Age=28800']) {
        assert.ok(cookie.includes(attribute), `${attribute} in ${cookie}`);
      }

      const session = cookie.split(';')[0];
      await request.get('/dash/index.html').set('Cookie', session).expect(200);
      await request.get('/dash/api').set('Cookie', session).expect(200);
      await request.get('/dash/api').expect(401);
    });

    it('protects state-changing requests from CSRF like any cookie', async () => {
      const request = dashboard(options);
      const session = sessionCookie(await request.get('/dash/?ticket=valid-csrf'))!.split(';')[0];
      await request.post('/dash/api/jobs/delete').set('Cookie', session).expect(403);
      await request.post('/dash/api/jobs/delete').set('Cookie', session).set('X-Requested-With', 'XMLHttpRequest').expect(200);
    });

    it('accepts each ticket once and drops invalid ones from the URL without a session', async () => {
      const request = dashboard(options);
      assert.ok(sessionCookie(await request.get('/dash/?ticket=valid-once').expect(302)));
      const replayed = await request.get('/dash/?ticket=valid-once').expect(302);
      assert.equal(sessionCookie(replayed), undefined);
      const invalid = await request.get('/dash/?ticket=forged').expect(302);
      assert.equal(invalid.headers.location, './');
      assert.equal(sessionCookie(invalid), undefined);
    });

    it('refuses tampered and expired sessions', async () => {
      const request = dashboard(options);
      const session = sessionCookie(await request.get('/dash/?ticket=valid-tamper'))!.split(';')[0];
      const [body, signature] = session.slice('agendash_session='.length).split('.');
      const promoted = Buffer.from(JSON.stringify({ exp: 4102444800, p: { role: 'admin' } })).toString('base64url');
      await request.get('/dash/api').set('Cookie', `agendash_session=${promoted}.${signature}`).expect(401);
      await request.get('/dash/api').set('Cookie', `agendash_session=${body}.${signature}x`).expect(401);

      const expired = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 1 })).toString('base64url');
      const expiredSignature = createHmac('sha256', secret).update(expired).digest('base64url');
      await request.get('/dash/api').set('Cookie', `agendash_session=${expired}.${expiredSignature}`).expect(401);
    });

    it('keeps what verifyTicket returned for readOnly(req)', async () => {
      const request = dashboard(options, { readOnly });
      const viewer = sessionCookie(await request.get('/dash/?ticket=valid-viewer'))!.split(';')[0];
      const admin = sessionCookie(await request.get('/dash/?ticket=valid-admin'))!.split(';')[0];
      const csrf = { 'X-Requested-With': 'XMLHttpRequest' };
      await request.post('/dash/api/jobs/delete').set('Cookie', viewer).set(csrf).expect(403);
      await request.post('/dash/api/jobs/delete').set('Cookie', admin).set(csrf).expect(200);
    });

    it('shows browsers a sign-in page, mentioning blocked cookies inside a frame', async () => {
      const request = dashboard(options);
      const page = await request.get('/dash/').set('Accept', 'text/html').expect(401).expect('Content-Type', /html/);
      assert.match(page.text, /Sign-in required/);
      assert.doesNotMatch(page.text, /block the cookie/);
      const framed = await request.get('/dash/').set('Accept', 'text/html').set('Sec-Fetch-Dest', 'iframe').expect(401);
      assert.match(framed.text, /block the cookie/);
      const api = await request.get('/dash/api').expect(401);
      assert.deepEqual(api.body.auth, { strategies: ['ticket'], loginUrl: null });
    });

    it('honours same-site cookie options', async () => {
      const request = dashboard({ ...options, session: { secret, sameSite: 'lax', name: 'sid', path: '/', maxAge: 600 } });
      const cookie = ((await request.get('/dash/?ticket=valid-lax')).headers['set-cookie'] as unknown as string[])[0];
      assert.ok(cookie.startsWith('sid='));
      assert.ok(cookie.includes('SameSite=Lax') && cookie.includes('Path=/') && cookie.includes('Max-Age=600'));
      assert.ok(!cookie.includes('Partitioned'));
    });
  });

  describe('auth info', () => {
    it('tells host code which strategy let the request in and with what principal', async () => {
      const seen: unknown[] = [];
      const request = dashboard(
        { strategies: [{ type: 'cookie', name: 'sid', verify: (value) => (value === 'abc' ? { user: 'ada' } : false) }, { type: 'apiKey', keys: 'k' }] },
        { readOnly: (req) => { seen.push(getAgendashAuth(req)); return false; } },
      );
      await request.post('/dash/api/jobs/delete').set('Cookie', 'sid=abc').set('X-Requested-With', 'XMLHttpRequest').expect(200);
      await request.post('/dash/api/jobs/delete').set('X-API-Key', 'k').expect(200);
      assert.deepEqual(seen, [{ strategy: 'cookie', principal: { user: 'ada' } }, { strategy: 'apiKey', principal: undefined }]);
    });
  });

  describe('readOnly', () => {
    it('refuses every state-changing request', async () => {
      const request = dashboard(undefined, { readOnly: true });
      await request.get('/dash/api').expect(200);
      const response = await request.post('/dash/api/jobs/delete').expect(403);
      assert.equal(response.body.message, 'Agendash is in read-only mode');
    });

    it('can depend on the authenticated user', async () => {
      const request = dashboard(
        { type: 'apiKey', keys: ['admin-key', 'viewer-key'] },
        { readOnly: (req) => req.get('x-api-key') !== 'admin-key' },
      );
      await request.post('/dash/api/jobs/delete').set('X-API-Key', 'viewer-key').expect(403);
      await request.post('/dash/api/jobs/delete').set('X-API-Key', 'admin-key').expect(200);
    });
  });
});

describe('Agendash with auth and readOnly', () => {
  let context: TestContext;
  let agendash: AgendashInstance;
  let request: ReturnType<typeof supertest>;

  before(async () => {
    context = await startAgenda();
    agendash = Agendash(context.agenda, {
      taskLogs: false,
      auth: { type: 'apiKey', keys: ['admin-key', 'viewer-key'] },
      readOnly: (req) => req.get('x-api-key') !== 'admin-key',
    });
    const app = express();
    app.use('/dash', agendash.middleware);
    request = supertest(app);
  });

  after(async () => {
    await agendash.controller.close();
    await stopAgenda(context);
  });

  it('opens a ticket session from the mount path without a trailing slash', async () => {
    const ticketed = Agendash(context.agenda, {
      taskLogs: false,
      auth: { type: 'ticket', verifyTicket: (ticket) => ticket === 'one-time', session: { secret: 'a-session-secret-of-at-least-32-chars' } },
    });
    try {
      const app = express();
      app.use('/dash', ticketed.middleware);
      const host = supertest(app);
      await host.get('/dash?ticket=one-time').expect(302).expect('Location', './dash/?ticket=one-time');
      const exchange = await host.get('/dash/?ticket=one-time').expect(302).expect('Location', './');
      const session = (exchange.headers['set-cookie'] as unknown as string[])[0];
      assert.ok(session.includes('Path=/dash'), session);
      await host.get('/dash/').set('Cookie', session.split(';')[0]).expect(200).expect('Content-Type', /html/);
      await host.get('/dash/api').set('Cookie', session.split(';')[0]).expect(200);
    } finally {
      await ticketed.controller.close();
    }
  });

  it('refuses invalid auth options when it is created', () => {
    assert.throws(() => Agendash(context.agenda, { auth: { type: 'apiKey', keys: undefined } }), /Agendash auth/);
  });

  it('serves the UI but guards the API', async () => {
    await request.get('/dash/').expect(200);
    await request.get('/dash/api').expect(401);
    const response = await request.get('/dash/api').set('X-API-Key', 'viewer-key').expect(200);
    assert.equal(response.body.overview[0].displayName, 'All Jobs');
  });

  it('tells the UI whether the current user is read-only', async () => {
    const viewer = await request.get('/dash/api/config').set('X-API-Key', 'viewer-key').expect(200);
    assert.deepEqual(viewer.body, { readOnly: true });
    const admin = await request.get('/dash/api/config').set('X-API-Key', 'admin-key').expect(200);
    assert.deepEqual(admin.body, { readOnly: false });
    await request.get('/dash/api/config').expect(401);
  });

  it('lets only non read-only users change jobs', async () => {
    const job = { jobName: 'Guarded Job', jobSchedule: 'in 2 minutes', jobRepeatEvery: '', jobData: {} };
    await request.post('/dash/api/jobs/create').set('X-API-Key', 'viewer-key').send(job).expect(403);
    assert.equal(await context.agenda._collection.countDocuments({}), 0);
    await request.post('/dash/api/jobs/create').set('X-API-Key', 'admin-key').send(job).expect(200);
    assert.equal(await context.agenda._collection.countDocuments({}), 1);
  });
});
