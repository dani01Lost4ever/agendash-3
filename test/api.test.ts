import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';

import Agendash, { type AgendashInstance } from '../src';
import { startAgenda, stopAgenda, waitFor, type TestContext } from './helpers';

describe('HTTP API', () => {
  let context: TestContext;
  let agendash: AgendashInstance;
  let request: ReturnType<typeof supertest>;

  before(async () => {
    context = await startAgenda();
    agendash = Agendash(context.agenda);
    const app = express();
    app.use('/dash', agendash.middleware);
    request = supertest(app);
  });

  beforeEach(async () => {
    await context.agenda._collection.deleteMany({});
  });

  after(async () => {
    await agendash.controller.close();
    await stopAgenda(context);
  });

  it('GET /api with no jobs returns the overview', async () => {
    const response = await request.get('/dash/api?limit=200&skip=0').expect(200);

    assert.equal(response.body.overview[0].displayName, 'All Jobs');
    assert.equal(response.body.jobs.length, 0);
  });

  it('GET /api lists jobs with their state', async () => {
    await context.agenda.create('Listed Job', { foo: 'bar' }).schedule('in 10 minutes').save();

    const response = await request.get('/dash/api?limit=200&skip=0').expect(200);

    assert.equal(response.body.jobs.length, 1);
    assert.equal(response.body.jobs[0].job.name, 'Listed Job');
    assert.equal(response.body.jobs[0].scheduled, true);
    assert.equal(response.body.totalPages, 1);
  });

  it('POST /api/jobs/create creates the job', async () => {
    const response = await request
      .post('/dash/api/jobs/create')
      .send({
        jobName: 'Test Job',
        jobSchedule: 'in 2 minutes',
        jobRepeatEvery: '',
        jobData: {},
      })
      .expect(200);

    assert.deepEqual(response.body, { created: true });
    assert.equal(await context.agenda._collection.countDocuments({}), 1);
  });

  it('POST /api/jobs/delete deletes the job', async () => {
    const job = await context.agenda.create('Test Job', {}).schedule('in 4 minutes').save();

    const response = await request
      .post('/dash/api/jobs/delete')
      .send({ jobIds: [job.attrs._id] })
      .expect(200);

    assert.deepEqual(response.body, { deleted: true });
    assert.equal(await context.agenda._collection.countDocuments({}), 0);
  });

  it('POST /api/jobs/requeue creates a copy of the job', async () => {
    const job = await context.agenda.create('Test Job', {}).schedule('in 4 minutes').save();

    await request
      .post('/dash/api/jobs/requeue')
      .send({ jobIds: [job.attrs._id] })
      .expect(200);

    assert.equal(await context.agenda._collection.countDocuments({}), 2);
  });

  it('GET /api/jobs/:id/logs returns the execution log of a job', async () => {
    context.agenda.define('Logged Job', async () => {});
    await context.agenda.start();
    const job = await context.agenda.now('Logged Job', { answer: 42 });

    const logs = await waitFor(async () => {
      const response = await request.get(`/dash/api/jobs/${job.attrs._id}/logs`).expect(200);
      return response.body.length === 2 ? response.body : undefined;
    });
    await context.agenda.stop();

    assert.deepEqual(
      logs.map((log: { status: string }) => log.status).sort(),
      ['completed', 'started'],
    );
    assert.equal(logs[0].taskName, 'Logged Job');
    assert.deepEqual(logs[0].data, { answer: 42 });
  });

  it('answers errors with a message only', async () => {
    const invalid = await request.post('/dash/api/jobs/create').send({ jobName: '' }).expect(400);
    assert.deepEqual(invalid.body, { message: 'Job name is required' });

    // A driver or BSON error is logged on the server, not sent to the client
    const failed = await request.post('/dash/api/jobs/requeue').send({ jobIds: ['not-an-id'] }).expect(404);
    assert.deepEqual(failed.body, { message: 'Could not requeue the jobs' });
  });

  it('redirects the mount path to its trailing-slash form', async () => {
    await request.get('/dash').expect(302).expect('Location', './dash/');
    await request.get('/dash?limit=5').expect(302).expect('Location', './dash/?limit=5');
  });

  it('serves the dashboard with a Content-Security-Policy header', async () => {
    const response = await request.get('/dash/').expect(200);

    assert.match(response.text, /<div id="agendash-root">/);
    const csp = String(response.headers['content-security-policy']);
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.match(csp, /style-src 'self'(;|$)/);
  });

  it('serves the bundled assets referenced by the dashboard', async () => {
    const page = await request.get('/dash/').expect(200);
    const assets = [...page.text.matchAll(/(?:src|href)="\.\/(assets\/[^"]+)"/g)].map((match) => match[1]);
    assert.ok(assets.length >= 2, 'expected the script and stylesheet bundles');

    for (const asset of assets) {
      await request.get(`/dash/${asset}`).expect(200);
    }
  });
});
