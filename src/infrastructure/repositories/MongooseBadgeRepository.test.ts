import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Badge } from '@/models/Badge';

import { MongooseBadgeRepository } from './MongooseBadgeRepository';

let mongod: MongoMemoryServer;
const repo = new MongooseBadgeRepository();

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await Badge.deleteMany({});
});

const badge = (id: string) => ({
    id,
    name: `Badge ${id}`,
    description: 'desc',
    icon: 'bug' as const,
    color: '#ffffff',
});

describe('MongooseBadgeRepository', () => {
    it('creates badges and lists them oldest first', async () => {
        await repo.create(badge('first'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        const second = await repo.create(badge('second'));

        expect(second.id).toBe('second');
        expect((await repo.findAll()).map((b) => b.id)).toEqual([
            'first',
            'second',
        ]);
    });

    it('looks badges up by legacy id or snowflake id', async () => {
        await repo.create(badge('legacy'));
        await Badge.collection.insertOne({
            ...badge('modern'),
            snowflakeId: '1000000000000000301',
            createdAt: new Date(),
        });

        expect((await repo.findByIdOrSnowflake('legacy'))?.id).toBe('legacy');
        expect(
            (await repo.findByIdOrSnowflake('1000000000000000301'))?.id,
        ).toBe('modern');
        expect(await repo.findByIdOrSnowflake('missing')).toBeNull();

        const found = await repo.findByIdsOrSnowflakes([
            'legacy',
            '1000000000000000301',
            'missing',
        ]);
        expect(found.map((b) => b.id).sort()).toEqual(['legacy', 'modern']);
    });

    it('updates only the provided fields', async () => {
        await repo.create(badge('b1'));

        const updated = await repo.update('b1', { name: 'Renamed' });

        expect(updated?.name).toBe('Renamed');
        expect(updated?.description).toBe('desc');
        expect(await repo.update('missing', { name: 'x' })).toBeNull();
    });

    it('deletes by legacy id', async () => {
        await repo.create(badge('gone'));

        await repo.deleteByIdOrSnowflake('gone');

        expect(await repo.findByIdOrSnowflake('gone')).toBeNull();
    });
});
