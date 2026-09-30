import assert from 'node:assert/strict';
import express from 'express';
import type { Express } from 'express';
import supertest from 'supertest';

import Agendash, { type AgendashInstance } from '../src';
import { AgendashAuthOptions, AgendashReadOnlyOption, createAuthMiddleware, createReadOnlyGuard } from '../src/auth';
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
