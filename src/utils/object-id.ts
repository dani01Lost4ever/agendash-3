import { ObjectId } from 'mongodb';
import type { Collection } from 'mongodb';

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
export function objectIdFor(collection: Collection | undefined): ObjectIdConstructor {
  const pkFactory = (collection as CollectionInternals | undefined)?.s?.pkFactory;
  const sample = pkFactory?.createPk?.() as object | undefined;
  const constructor: unknown = sample?.constructor;
  return isObjectIdConstructor(constructor) ? constructor : ObjectId;
}

function isObjectIdConstructor(value: unknown): value is ObjectIdConstructor {
  return typeof value === 'function' && typeof (value as { isValid?: unknown }).isValid === 'function';
}
