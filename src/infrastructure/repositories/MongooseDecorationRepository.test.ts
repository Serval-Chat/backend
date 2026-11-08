import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { MongooseDecorationRepository } from './MongooseDecorationRepository';

let mongod: MongoMemoryServer;
const repo = new MongooseDecorationRepository();

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

describe('MongooseDecorationRepository', () => {
    it('creates, finds, lists newest first, and deletes decorations', async () => {
        const older = await repo.create({
            name: 'Older',
            filename: 'a.webp',
            createdBy: 'u1',
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const newer = await repo.create({
            name: 'Newer',
            filename: 'b.gif',
            createdBy: 'u1',
        });
        await repo.create({
            name: 'Theirs',
            filename: 'c.webp',
            createdBy: 'u2',
        });

        expect(older.snowflakeId).toMatch(/^\d+$/);
        expect((await repo.findById(newer.snowflakeId))?.name).toBe('Newer');
        expect((await repo.findByCreator('u1')).map((d) => d.name)).toEqual([
            'Newer',
            'Older',
        ]);

        await repo.delete(older.snowflakeId);

        expect(await repo.findById(older.snowflakeId)).toBeNull();
        expect((await repo.findByCreator('u1')).map((d) => d.name)).toEqual([
            'Newer',
        ]);
    });
});
