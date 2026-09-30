import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';

import Agendash, { AgendashController } from '../src';
import { normalizeOptions } from '../src/options';
import { objectIdFor } from '../src/utils/object-id';
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

  it('drops the Mongoose 8 options autoSearchIndex and config', () => {
    const options = normalizeOptions('mongodb://localhost/logs', { autoSearchIndex: false, config: { autoIndex: false } });

    assert.deepEqual(options.taskLogs && options.taskLogs.connectionOptions, {});
  });

  it('keeps the credentials of the connection string when user and pass are empty', () => {
    const options = normalizeOptions('mongodb://agendash:secret@localhost/logs', { user: '', pass: '' });

    assert.deepEqual(options.taskLogs && options.taskLogs.connectionOptions, {});
  });

  it('accepts a legacy options variable typed as an interface, like Mongoose ConnectOptions', () => {
    interface ConnectOptions {
      dbName?: string;
      autoIndex?: boolean;
      maxPoolSize?: number;
    }
    const connectOptions: ConnectOptions = { dbName: 'logs', autoIndex: false, maxPoolSize: 5 };

    assert.deepEqual(normalizeOptions('mongodb://localhost/logs', connectOptions).taskLogs, {
      connectionString: 'mongodb://localhost/logs',
      connectionOptions: { dbName: 'logs', maxPoolSize: 5 },
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
      // Agenda's driver may use another major version of bson than the dedicated connection
      const AgendaObjectId = objectIdFor(context.agenda._collection);
      const userId = new AgendaObjectId();
      const job = await context.agenda.now('Logged Job', { userId });

      const client = await MongoClient.connect(uri);
      try {
        const logs = client.db('agendash-logs').collection('tasklogs');
        await waitFor(async () => (await logs.countDocuments({ taskId: job.attrs._id.toString() })) === 2);
        const entry = await logs.findOne({ taskId: job.attrs._id.toString() });
        assert.equal(String(entry?.data?.userId), userId.toString());
      } finally {
        await client.close();
        await context.agenda.stop();
        await controller.close();
      }
    });

    it('keeps the legacy constructor form of AgendashController', async () => {
      const uri = `${context.mongoServer.getUri()}agendash-logs`;
      const controller = new AgendashController(context.agenda, uri, { dbName: 'agendash-logs' });
      try {
        const client = await MongoClient.connect(uri);
        try {
          const taskId = new ObjectId().toString();
          await client.db('agendash-logs').collection('tasklogs').insertOne({ taskId, status: 'started', timestamp: new Date() });
          assert.equal((await controller.getTaskLogs(taskId)).length, 1);
        } finally {
          await client.close();
        }
      } finally {
        await controller.close();
      }
    });

    it('reports an invalid task-log connection on use instead of throwing at startup', async () => {
      const { controller } = Agendash(context.agenda, 'not-a-connection-string');
      try {
        await assert.rejects(controller.getTaskLogs('anything'));
      } finally {
        await controller.close();
      }
    });

    it('does not reconnect the task-log connection once closed', async () => {
      const uri = `${context.mongoServer.getUri()}agendash-logs`;
      const { controller } = Agendash(context.agenda, uri);
      await controller.close();

      await assert.rejects(controller.getTaskLogs('anything'), /closed/);
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
