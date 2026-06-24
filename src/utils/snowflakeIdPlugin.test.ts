import mongoose, { Schema } from 'mongoose';

import { isValidSnowflakeId, snowflakeIdPlugin } from './snowflake';

describe('snowflakeIdPlugin', () => {
    const makeModel = () => {
        const schema = new Schema({ name: String });
        schema.plugin(snowflakeIdPlugin);
        return mongoose.model(
            `SnowflakeIdPluginTest_${Math.random().toString(36).slice(2)}`,
            schema,
        );
    };

    test('assigns a valid snowflakeId on validate when none is set', async () => {
        const Model = makeModel();
        const doc = new Model({ name: 'a' });

        expect(doc.get('snowflakeId')).toBeUndefined();
        await doc.validate();
        expect(isValidSnowflakeId(doc.get('snowflakeId'))).toBe(true);
    });

    test('does not overwrite an existing snowflakeId on validate', async () => {
        const Model = makeModel();
        const doc = new Model({
            name: 'a',
            snowflakeId: '0000000000000000001',
        });

        await doc.validate();
        expect(doc.get('snowflakeId')).toBe('0000000000000000001');
    });

    test('declares a sparse unique index on snowflakeId', () => {
        const Model = makeModel();
        const indexes = Model.schema.indexes();
        const snowflakeIndex = indexes.find(
            ([fields]) => 'snowflakeId' in fields,
        );

        expect(snowflakeIndex).toBeDefined();
        expect(snowflakeIndex?.[1]).toMatchObject({
            unique: true,
            sparse: true,
        });
    });
});
