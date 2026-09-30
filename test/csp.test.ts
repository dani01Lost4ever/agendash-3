import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';

import Agendash from '../src';
import { contentSecurityPolicy, frameAncestorsSources } from '../src/http/csp';
import { startAgenda, stopAgenda, type TestContext } from './helpers';

function policyOf(frameAncestors?: string[]) {
  const app = express();
  app.use(contentSecurityPolicy({ frameAncestors }));
  app.get('/', (_request, response) => {
    response.send('ok');
  });
  return supertest(app)
    .get('/')
    .then((response) => String(response.headers['content-security-policy']));
}

describe('Content-Security-Policy', () => {
  it('only lets the same origin frame the dashboard by default', async () => {
    assert.match(await policyOf(), /frame-ancestors 'self'(;|$)/);
  });

  it('lets the host allow other origins to frame the dashboard', async () => {
    const policy = await policyOf(["'self'", 'https://app.example.com', 'https://*.example.org:8443']);

    assert.match(policy, /frame-ancestors 'self' https:\/\/app\.example\.com https:\/\/\*\.example\.org:8443(;|$)/);
    assert.match(policy, /script-src 'self'(;|$)/);
  });

  it('quotes the self and none keywords', () => {
    assert.deepEqual(frameAncestorsSources(['self', 'https://app.example.com']), ["'self'", 'https://app.example.com']);
    assert.deepEqual(frameAncestorsSources(['none']), ["'none'"]);
  });

  it('rejects sources that would change the rest of the policy', () => {
    for (const source of ['https://app.example.com; script-src *', 'https://a.com https://b.com', 'x,y', '', "'unsafe-inline'"]) {
      assert.throws(() => frameAncestorsSources([source]), TypeError, source);
    }
    assert.throws(() => frameAncestorsSources([]), TypeError);
    assert.throws(() => frameAncestorsSources(["'none'", 'https://app.example.com']), TypeError);
  });

  describe('through Agendash()', () => {
    let context: TestContext;

    before(async () => {
      context = await startAgenda();
    });

    after(async () => {
      await stopAgenda(context);
    });

    it('applies the frameAncestors option to the dashboard and the API', async () => {
      const agendash = Agendash(context.agenda, { frameAncestors: ['https://app.example.com'], taskLogs: false });
      const app = express();
      app.use('/dash', agendash.middleware);
      const request = supertest(app);

      try {
        for (const path of ['/dash/', '/dash/api?limit=1&skip=0']) {
          const response = await request.get(path).expect(200);
          assert.match(String(response.headers['content-security-policy']), /frame-ancestors https:\/\/app\.example\.com(;|$)/);
          assert.equal(response.headers['x-frame-options'], undefined);
        }
      } finally {
        await agendash.controller.close();
      }
    });

    it('throws on an invalid source before touching Agenda', () => {
      const listeners = context.agenda.listenerCount('start');
      assert.throws(() => Agendash(context.agenda, { frameAncestors: ['https://a.com;'] }), TypeError);
      assert.equal(context.agenda.listenerCount('start'), listeners);
    });
  });
});
