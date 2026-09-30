import type { Agenda } from '@sealos/agenda';

import { objectIdFor } from '../src/utils/object-id';

/** Enough orders to fill more than one page of the job list. */
export const DEMO_ORDER_COUNT = 60;

const HOUR = 60 * 60 * 1000;

/**
 * Defines and schedules sample jobs so every state of the dashboard has something to show:
 * completed, failed, running, repeating, scheduled and queued jobs, plus paginated orders
 * whose data holds an ObjectId for the "Is ObjectId?" search.
 */
export async function seedDemoJobs(agenda: Agenda): Promise<void> {
  agenda.define('send-welcome-email', async () => {});
  agenda.define('generate-report', () => Promise.reject(new Error('Report template "monthly-sales" not found')));
  agenda.define('import-large-dataset', { lockLifetime: 24 * HOUR }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 24 * HOUR));
  });
  agenda.define('cleanup-temp-files', async () => {});
  agenda.define('nightly-backup', async () => {});
  agenda.define('send-reminder', async () => {});
  agenda.define('quarterly-audit', async () => {});
  agenda.define('process-order', async () => {});
  // 'legacy-sync' is left undefined on purpose: nothing processes it, so it stays queued.

  await agenda.now('send-welcome-email', { userId: 42, email: 'ada@example.com' });
  await agenda.now('generate-report', { report: 'monthly-sales', month: '2026-08' });
  await agenda.now('import-large-dataset', { source: 's3://demo-bucket/dataset.csv' });
  await agenda.every('1 minute', 'cleanup-temp-files', { directory: '/tmp/uploads' });
  await agenda.every('0 3 * * *', 'nightly-backup', { target: 'backups' });

  const reminder = agenda.create('send-reminder', { userId: 7, message: 'Your trial ends soon' });
  reminder.priority('high');
  reminder.schedule(new Date(Date.now() + 2 * HOUR));
  await reminder.save();

  await agenda.schedule('in 3 days', 'quarterly-audit', { quarter: 'Q3' });

  const legacySync = agenda.create('legacy-sync', { system: 'erp' });
  legacySync.schedule(new Date(Date.now() - HOUR));
  await legacySync.save();

  // Ids must come from Agenda's own driver, see objectIdFor
  await agenda._ready;
  const ObjectId = objectIdFor(agenda._collection);
  const customers = ['64b000000000000000000001', '64b000000000000000000002', '64b000000000000000000003'];
  for (let order = 1; order <= DEMO_ORDER_COUNT; order++) {
    await agenda.now('process-order', {
      orderId: order,
      customerId: new ObjectId(customers[order % customers.length]),
      total: Math.round(order * 17.5 * 100) / 100,
    });
  }
}
