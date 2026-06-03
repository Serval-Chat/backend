import type { Schema } from 'mongoose';
import { Types } from 'mongoose';

type PlainRecord = Record<string, unknown>;

type ObjectIdLike = {
    toHexString(): string;
};

const isObjectIdLike = (value: unknown): value is ObjectIdLike =>
    value instanceof Types.ObjectId ||
    (value !== null &&
        typeof value === 'object' &&
        typeof (value as { toHexString?: unknown }).toHexString ===
            'function' &&
        typeof (value as { _bsontype?: unknown })._bsontype === 'string' &&
        String((value as { _bsontype?: unknown })._bsontype).includes(
            'ObjectID',
        ));

const isPlainRecord = (value: unknown): value is PlainRecord =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !Buffer.isBuffer(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null);

const cloneWithId = <T>(value: T, idKey: 'id' | '_id'): T => {
    if (isObjectIdLike(value)) {
        return value.toHexString() as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => cloneWithId(item, idKey)) as T;
    }

    if (!isPlainRecord(value)) {
        return value;
    }

    const sourceKey = idKey === 'id' ? '_id' : 'id';
    const next: PlainRecord = {};

    for (const [key, childValue] of Object.entries(value)) {
        if (key === sourceKey) {
            continue;
        }

        next[key] = cloneWithId(childValue, idKey);
    }

    if (value[sourceKey] !== undefined && value[idKey] === undefined) {
        next[idKey] = value[sourceKey];
    }

    return next as T;
};

export const toApiId = <T>(value: T): T => cloneWithId(value, 'id');

export const toDatabaseId = <T>(value: T): T => cloneWithId(value, '_id');

export const toObjectId = (value: string | Types.ObjectId): Types.ObjectId =>
    value instanceof Types.ObjectId ? value : new Types.ObjectId(value);

export const toObjectIds = (
    values: readonly (string | Types.ObjectId)[],
): Types.ObjectId[] => values.map(toObjectId);

export const getDocumentId = (value: {
    _id?: unknown;
    id?: unknown;
}): unknown => value._id ?? value.id;

export const getDocumentIdString = (value: {
    _id?: unknown;
    id?: unknown;
}): string => {
    const id = getDocumentId(value);
    if (id === undefined || id === null) {
        throw new Error('Document is missing id');
    }

    return typeof id === 'string' ? id : String(id);
};

export const mongooseIdPlugin = (schema: Schema): void => {
    const transform = (_doc: unknown, ret: PlainRecord): PlainRecord =>
        toApiId(ret);

    const existingToJSON = schema.get('toJSON') ?? {};
    const existingToObject = schema.get('toObject') ?? {};

    schema.set('toJSON', {
        virtuals: true,
        ...existingToJSON,
        transform,
    });

    schema.set('toObject', {
        virtuals: true,
        ...existingToObject,
        transform,
    });
};
