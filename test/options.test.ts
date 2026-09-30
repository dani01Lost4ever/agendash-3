import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';

import Agendash from '../src';
import { normalizeOptions } from '../src/options';
import { startAgenda, stopAgenda, waitFor, type TestContext } from './helpers';

describe('Agendash options', () => {
  it('keeps an options object as is', () => {
    assert.deepEqual(normalizeOptions({ taskLogs: false }), { taskLogs: false });
    assert.deepEqual(normalizeOptions(), {});
  });

  it('maps the legacy connection string form to a dedicated task-log connection', () => {
    const options = normalizeOptions('mongodb://localhost/logs', {
      dbName: 'logs',
      autoIndex: false,
      useNewUrlParser: true,
      user: 'agendash',
      pass: 'secret',
      maxPoolSize: 5,
    });

    assert.deepEqual(options, {
      taskLogs: {
        connectionString: 'mongodb://localhost/logs',
        connectionOptions: {
          dbName: 'logs',
          maxPoolSize: 5,
          auth: { username: 'agendash', password: 'secret' },
        },
      },
    });
  });

  describe('task logs', () => {
    let context: TestContext;

    before(async () => {
      context = await startAgenda();
      context.agenda.define('Logged Job', async () => {});
    });

    after(async () => {
      await stopAgenda(context);
    });

    it('writes to a dedicated connection with the legacy signature', async () => {
      const uri = `${context.mongoServer.getUri()}agendash-logs`;
      const { controller } = Agendash(context.agenda, uri, { dbName: 'agendash-logs' });
      await context.agenda.start();
      const job = await context.agenda.now('Logged Job', {});

      const client = await MongoClient.connect(uri);
      try {
        const logs = client.db('agendash-logs').collection('tasklogs');
        await waitFor(async () => (await logs.countDocuments({ taskId: job.attrs._id.toString() })) === 2);
      } finally {
        await client.close();
        await context.agenda.stop();
        await controller.close();
      }
    });

    it('does not log anything when task logs are disabled', async () => {
      const { controller } = Agendash(context.agenda, { taskLogs: false });
      assert.equal(context.agenda.listenerCount('start'), 0);
      assert.deepEqual(await controller.getTaskLogs('anything'), []);
      await controller.close();
    });

    it('stops listening to Agenda events once closed', async () => {
      const { controller } = Agendash(context.agenda);
      assert.equal(context.agenda.listenerCount('start'), 1);
      await controller.close();
      assert.equal(context.agenda.listenerCount('start'), 0);
    });
  });
});
