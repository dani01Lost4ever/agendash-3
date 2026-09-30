import assert from 'node:assert/strict';
import express from 'express';
import supertest from 'supertest';

import Agendash, { type AgendashInstance } from '../src';
import { objectIdFor } from '../src/utils/object-id';
import { startAgenda, stopAgenda, waitFor, type TestContext } from './helpers';

/** The error message of an API response. */
function messageOf(response: { body: unknown }): string {
  return (response.body as { message: string }).message;
}

describe('Job actions and queries', () => {
  let context: TestContext;
  let agendash: AgendashInstance;
  let request: ReturnType<typeof supertest>;

  const createJob = async (name: string, when = 'in 10 minutes', attrs: Record<string, unknown> = {}) => {
    const job = context.agenda.create(name, {}).schedule(when);
    Object.assign(job.attrs, attrs);
    await job.save();
    return job.attrs._id.toString();
  };
  const findJob = (id: string) => {
    const ObjectId = objectIdFor(context.agenda._collection);
    return context.agenda._collection.findOne({ _id: new ObjectId(id) });
  };

  before(async () => {
    context = await startAgenda();
    agendash = Agendash(context.agenda, { taskLogs: false });
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

  describe('GET /api', () => {
    it('sorts across pages by the requested field', async () => {
      await createJob('charlie');
      await createJob('alpha');
      await createJob('bravo');

      const names = async (sortDir: string, skip: number) => {
        const response = await request
          .get(`/dash/api?limit=2&skip=${skip}&sortBy=name&sortDir=${sortDir}`)
          .expect(200);
        return response.body.jobs.map((item: { job: { name: string } }) => item.job.name);
      };

      assert.deepEqual(await names('asc', 0), ['alpha', 'bravo']);
      assert.deepEqual(await names('asc', 2), ['charlie']);
      assert.deepEqual(await names('desc', 0), ['charlie', 'bravo']);
    });

    it('reports the number of matching jobs', async () => {
      await createJob('one');
      await createJob('two');
      await createJob('three');

      const response = await request.get('/dash/api?limit=2').expect(200);

      assert.equal(response.body.totalJobs, 3);
      assert.equal(response.body.totalPages, 2);
      assert.equal(response.body.jobs.length, 2);
    });

    it('matches names with a /regex/ and exactly otherwise', async () => {
      await createJob('send-email');
      await createJob('send-sms');
      await createJob('cleanup');

      const regex = await request.get(`/dash/api?job=${encodeURIComponent('/^SEND-/')}`).expect(200);
      assert.equal(regex.body.jobs.length, 2);

      const exact = await request.get('/dash/api?job=send').expect(200);
      assert.equal(exact.body.jobs.length, 0);
    });

    it('answers 400 with a message for an invalid regex', async () => {
      const response = await request.get(`/dash/api?job=${encodeURIComponent('/(/')}`).expect(400);

      assert.match(messageOf(response), /Invalid regular expression/);
    });

    it('filters disabled jobs and counts them in the overview', async () => {
      await createJob('paused', 'in 10 minutes', { disabled: true });
      await createJob('active');

      const response = await request.get('/dash/api?state=disabled').expect(200);

      assert.deepEqual(
        response.body.jobs.map((item: { job: { name: string } }) => item.job.name),
        ['paused'],
      );
      assert.equal(response.body.overview[0].disabled, 1);
      assert.equal(response.body.overview[0].total, 2);
    });
  });

  describe('GET /api/jobs/:jobId', () => {
    it('returns the job with its state', async () => {
      const id = await createJob('single');

      const response = await request.get(`/dash/api/jobs/${id}`).expect(200);

      assert.equal(response.body.job.name, 'single');
      assert.equal(response.body.scheduled, true);
      assert.equal(response.body.disabled, false);
    });

    it('answers 404 for an unknown job and 400 for an invalid id', async () => {
      await request.get('/dash/api/jobs/5f0000000000000000000000').expect(404);
      const response = await request.get('/dash/api/jobs/not-an-id').expect(400);

      assert.match(messageOf(response), /Invalid job ID/);
    });
  });

  describe('POST /api/jobs/run', () => {
    it('schedules the job for now without creating a copy', async () => {
      const id = await createJob('later', 'in 2 days');

      const response = await request.post('/dash/api/jobs/run').send({ jobIds: [id] }).expect(200);

      assert.deepEqual(response.body, { updated: 1, changed: 1, skipped: 0 });
      assert.equal(await context.agenda._collection.countDocuments({}), 1);
      const job = await findJob(id);
      assert.ok(job && job.nextRunAt.getTime() <= Date.now());
    });

    it('runs the job at the next scan', async () => {
      context.agenda.define('run me', async () => {});
      const id = await createJob('run me', 'in 2 days');
      await context.agenda.start();
      try {
        await request.post('/dash/api/jobs/run').send({ jobIds: [id] }).expect(200);
        await waitFor(async () => (await findJob(id))?.lastFinishedAt);
      } finally {
        await context.agenda.stop();
      }
    });

    it('skips running and disabled jobs', async () => {
      const running = await createJob('busy', 'in 2 days', { lockedAt: new Date() });
      const disabled = await createJob('off', 'in 2 days', { disabled: true });

      const response = await request
        .post('/dash/api/jobs/run')
        .send({ jobIds: [running, disabled] })
        .expect(200);

      assert.deepEqual(response.body, { updated: 0, changed: 0, skipped: 2 });
    });
  });

  describe('POST /api/jobs/disable and /api/jobs/enable', () => {
    it('toggles the disabled flag', async () => {
      const id = await createJob('toggle');

      await request.post('/dash/api/jobs/disable').send({ jobIds: [id] }).expect(200);
      assert.equal((await findJob(id))?.disabled, true);

      await request.post('/dash/api/jobs/enable').send({ jobIds: [id] }).expect(200);
      assert.equal((await findJob(id))?.disabled, false);
    });

    it('leaves running jobs alone', async () => {
      const id = await createJob('busy', 'in 2 days', { lockedAt: new Date() });

      const response = await request.post('/dash/api/jobs/disable').send({ jobIds: [id] }).expect(200);

      assert.deepEqual(response.body, { updated: 0, changed: 0, skipped: 1 });
      assert.notEqual((await findJob(id))?.disabled, true);
    });

    it('answers 400 without job ids and 404 for unknown jobs', async () => {
      const missing = await request.post('/dash/api/jobs/disable').send({}).expect(400);
      assert.equal(missing.body.message, 'No job IDs provided');

      await request
        .post('/dash/api/jobs/enable')
        .send({ jobIds: ['5f0000000000000000000000'] })
        .expect(404);
    });
  });

  describe('POST /api/jobs/create', () => {
    it('starts a repeating job at the scheduled time', async () => {
      const firstRun = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      await request
        .post('/dash/api/jobs/create')
        .send({
          jobName: 'Nightly',
          jobSchedule: firstRun.toISOString(),
          jobRepeatEvery: '1 day',
          jobData: { a: 1 },
        })
        .expect(200);

      const job = await context.agenda._collection.findOne({ name: 'Nightly' });
      assert.equal(job?.repeatInterval, '1 day');
      assert.equal(job?.nextRunAt.getTime(), firstRun.getTime());
      assert.deepEqual(job?.data, { a: 1 });
    });

    it('answers 400 with a message for invalid input', async () => {
      const noName = await request.post('/dash/api/jobs/create').send({ jobSchedule: 'in 1 minute' }).expect(400);
      assert.equal(noName.body.message, 'Job name is required');

      const noSchedule = await request.post('/dash/api/jobs/create').send({ jobName: 'x' }).expect(400);
      assert.match(messageOf(noSchedule), /schedule or repeat interval/);

      const badInterval = await request
        .post('/dash/api/jobs/create')
        .send({ jobName: 'x', jobRepeatEvery: 'every blue moon' })
        .expect(400);
      assert.match(messageOf(badInterval), /Invalid repeat interval/);

      assert.equal(await context.agenda._collection.countDocuments({}), 0);
    });
  });

  it('POST /api/jobs/delete answers 400 for invalid ids', async () => {
    const response = await request.post('/dash/api/jobs/delete').send({ jobIds: ['nope'] }).expect(400);

    assert.match(messageOf(response), /Invalid job ID/);
  });
});

describe('Execution log', () => {
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

  after(async () => {
    await agendash.controller.close();
    await stopAgenda(context);
  });

  it('logs a failed run as failed only, not also as completed', async () => {
    context.agenda.define('failing', () => Promise.reject(new Error('boom')));
    await context.agenda.start();
    const job = await context.agenda.now('failing', {});
    const statuses = async () => {
      const response = await request.get(`/dash/api/jobs/${String(job.attrs._id)}/logs`).expect(200);
      return (response.body as Array<{ status: string; message: string }>).map((log) => `${log.status}: ${log.message}`);
    };

    await waitFor(async () => (await statuses()).some((status) => status.startsWith('failed')));
    await context.agenda.stop();
    // Agenda emits 'complete' right after 'fail': give a wrong log entry time to land
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.deepEqual((await statuses()).sort(), ['failed: boom', 'started: Task started']);
  });
});
