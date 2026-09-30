import { Agenda } from '@sealos/agenda';
import { MongoMemoryServer } from 'mongodb-memory-server';

export interface TestContext {
  mongoServer: MongoMemoryServer;
  agenda: Agenda;
}

export async function startAgenda(): Promise<TestContext> {
  const mongoServer = await MongoMemoryServer.create();
  const agenda = new Agenda({
    db: {
      address: `${mongoServer.getUri()}agendash-test`,
      collection: 'agendash-test-collection',
    },
    // human-interval reads '100 milliseconds' as 100 seconds
    processEvery: '0.1 seconds',
  });
  await agenda._ready;
  return { mongoServer, agenda };
}

export async function stopAgenda({ mongoServer, agenda }: TestContext): Promise<void> {
  await agenda.stop();
  await agenda._db.close();
  await mongoServer.stop();
}

/** Polls `check` until it returns a truthy value or the timeout expires. */
export async function waitFor<T>(check: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
