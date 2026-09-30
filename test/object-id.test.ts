import assert from 'node:assert/strict';
import { ObjectId, UUID } from 'mongodb';

import { objectIdFor } from '../src/utils/object-id';
import { startAgenda, stopAgenda, type TestContext } from './helpers';

describe('objectIdFor', () => {
  let context: TestContext;

  before(async () => {
    context = await startAgenda();
  });

  after(async () => {
    await stopAgenda(context);
  });

  it("returns the ObjectId class of the collection's own driver", async () => {
    const job = await context.agenda.create('Some Job', {}).save();
    const AgendaObjectId = objectIdFor(context.agenda._collection);

    assert.equal(job.attrs._id?.constructor, AgendaObjectId);
    const found = await context.agenda._collection.findOne({
      _id: new AgendaObjectId(job.attrs._id?.toString()),
    });
    assert.equal(found?.name, 'Some Job');
  });

  it('falls back to the ObjectId of the resolved mongodb package', () => {
    assert.equal(objectIdFor(undefined), ObjectId);
  });

  it('ignores a custom pkFactory that does not produce ObjectIds', () => {
    const withPkFactory = (createPk: () => unknown) => ({ s: { pkFactory: { createPk } } });

    assert.equal(objectIdFor(withPkFactory(() => new UUID())), ObjectId);
    assert.equal(
      objectIdFor(
        withPkFactory(() => {
          throw new Error('no ids today');
        }),
      ),
      ObjectId,
    );
  });
});
