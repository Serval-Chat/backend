import { Types } from 'mongoose';

import { toApiId } from './mongooseId';

describe('toApiId', () => {
    test('converts a bare ObjectId to its hex string', () => {
        const objectId = new Types.ObjectId();
        expect(toApiId(objectId)).toBe(objectId.toHexString());
    });

    test('prefers snowflakeId over the Mongo _id-derived id virtual', () => {
        const objectId = new Types.ObjectId();
        const input = {
            _id: objectId,
            id: objectId.toHexString(),
            snowflakeId: '0000000000000000123',
            name: 'a message',
        };

        expect(toApiId(input)).toEqual({
            id: '0000000000000000123',
            snowflakeId: '0000000000000000123',
            name: 'a message',
        });
    });

    test('falls back to _id when there is no id or snowflakeId', () => {
        const objectId = new Types.ObjectId();
        const input = { _id: objectId, name: 'a message' };

        expect(toApiId(input)).toEqual({
            id: objectId.toHexString(),
            name: 'a message',
        });
    });

    test('recurses through arrays and nested objects', () => {
        const objectId = new Types.ObjectId();
        const input = [{ _id: objectId, nested: { _id: objectId } }];

        expect(toApiId(input)).toEqual([
            {
                id: objectId.toHexString(),
                nested: { id: objectId.toHexString() },
            },
        ]);
    });
});
