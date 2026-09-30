import { ObjectId } from 'mongodb';

export interface ObjectIdConstructor {
  new (id?: string): ObjectId;
  isValid(id: unknown): boolean;
}

interface CollectionInternals {
  s?: { pkFactory?: { createPk?: () => unknown } };
}

/**
 * Returns the `ObjectId` class of the driver that owns `collection`.
 *
 * A host application often has more than one `mongodb` version installed (Agenda's own,
 * Mongoose's, the application's). The driver refuses ObjectIds built by a different major
 * version of `bson`, so ids sent to Agenda's collection must come from Agenda's driver.
 * Falls back to the `mongodb` package this library resolves.
 */
export function objectIdFor(collection: unknown): ObjectIdConstructor {
  const pkFactory = (collection as CollectionInternals | undefined)?.s?.pkFactory;
  let sample: { _bsontype?: unknown; constructor?: unknown } | undefined;
  try {
    sample = pkFactory?.createPk?.() as typeof sample;
  } catch {
    // A custom pkFactory may throw; fall back to this package's ObjectId
  }
  // A custom pkFactory can produce other ids (e.g. UUID), while job ids are always ObjectIds
  const constructor = sample?._bsontype === 'ObjectId' ? sample.constructor : undefined;
  return isObjectIdConstructor(constructor) ? constructor : ObjectId;
}

function isObjectIdConstructor(value: unknown): value is ObjectIdConstructor {
  return typeof value === 'function' && typeof (value as { isValid?: unknown }).isValid === 'function';
}
