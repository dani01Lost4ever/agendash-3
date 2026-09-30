import assert from 'node:assert/strict';
import { Decimal128, ObjectId } from 'mongodb';

import { toLocalBson } from '../src/utils/bson';
import { objectIdFor } from '../src/utils/object-id';
import { startAgenda, stopAgenda, type TestContext } from './helpers';

describe('toLocalBson', () => {
  let context: TestContext;

  before(async () => {
    context = await startAgenda();
  });

  after(async () => {
    await stopAgenda(context);
  });

  it("converts BSON values of Agenda's driver, nested in objects and arrays", () => {
    const AgendaObjectId = objectIdFor(context.agenda._collection);
    const id = new AgendaObjectId();
    const date = new Date();

    const converted = toLocalBson({ user: { id }, ids: [id], date, count: 3, name: 'x', empty: null }) as {
      user: { id: unknown };
      ids: unknown[];
      date: Date;
    };

    assert.ok(converted.user.id instanceof ObjectId);
    assert.equal(String(converted.user.id), id.toString());
    assert.ok(converted.ids[0] instanceof ObjectId);
    assert.equal(converted.date, date);
    assert.deepEqual({ ...converted, user: undefined, ids: undefined }, { user: undefined, ids: undefined, date, count: 3, name: 'x', empty: null });
  });

  it('keeps values of its own driver as they are', () => {
    const id = new ObjectId();
    const amount = Decimal128.fromString('1.5');

    const converted = toLocalBson({ id, amount }) as { id: unknown; amount: unknown };

    assert.equal(converted.id, id);
    assert.equal(converted.amount, amount);
  });
});
