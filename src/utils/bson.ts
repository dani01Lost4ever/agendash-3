import { BSON } from 'mongodb';

const BSON_VERSION = Symbol.for('@@mdb.bson.version');
const LOCAL_BSON_VERSION = versionOf(new BSON.ObjectId());

interface BsonValue {
  _bsontype: string;
  toExtendedJSON?: (options: { relaxed: boolean }) => unknown;
}

function versionOf(value: object): unknown {
  return (value as Record<symbol, unknown>)[BSON_VERSION];
}

function isBsonValue(value: object): value is BsonValue {
  return typeof (value as { _bsontype?: unknown })._bsontype === 'string';
}

/**
 * Copies `value`, replacing BSON values (ObjectId, Decimal128, Binary, ...) created by another
 * major version of `bson` with values of the version this package's `mongodb` uses.
 *
 * Job data is loaded by the driver bundled with Agenda, and a driver refuses to write BSON values
 * of another major version (BSONVersionError). Values it can already write are kept as they are.
 */
export function toLocalBson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toLocalBson);
  }
  if (value === null || typeof value !== 'object' || value instanceof Date || value instanceof RegExp) {
    return value;
  }
  if (isBsonValue(value)) {
    if (versionOf(value) === LOCAL_BSON_VERSION || typeof value.toExtendedJSON !== 'function') {
      return value;
    }
    const extendedJson = value.toExtendedJSON({ relaxed: false }) as BSON.Document;
    try {
      return BSON.EJSON.deserialize(extendedJson, { relaxed: false });
    } catch {
      // e.g. a DBRef whose $id is itself a foreign value: store its Extended JSON form
      return toLocalBson(extendedJson);
    }
  }
  if (ArrayBuffer.isView(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toLocalBson(entry)]));
}
