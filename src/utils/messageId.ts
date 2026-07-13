import { type QueryFilter, Types } from 'mongoose';

/**
 * Builds a Mongo filter that matches a message by our canonical snowflake id,
 * and - when the value is a raw Mongo ObjectId - also by `_id`.
 */
export function resolveMessageIdFilter<T>(id: string): QueryFilter<T> {
    if (Types.ObjectId.isValid(id)) {
        return {
            $or: [{ snowflakeId: id }, { _id: new Types.ObjectId(id) }],
        };
    }
    return { snowflakeId: id };
}
