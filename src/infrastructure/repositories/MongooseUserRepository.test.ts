import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { User } from '@/models/User';
import { mapUser } from '@/utils/user';

import { MongooseUserRepository } from './MongooseUserRepository';

let mongod: MongoMemoryServer;
let repo: MongooseUserRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseUserRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

const createUser = (overrides: Record<string, unknown> = {}) =>
    User.create({
        username: `user_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        login: `login_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`,
        password: 'password123',
        ...overrides,
    });

describe('MongooseUserRepository.findByIds', () => {
    test('returns users whose mapped id matches their snowflakeId', async () => {
        const user = await createUser();

        const [found] = await repo.findByIds([user.snowflakeId]);
        if (!found) throw new Error('expected findByIds to return a user');

        expect(found.snowflakeId).toBe(user.snowflakeId);
        expect(mapUser(found)?.id).toBe(user.snowflakeId);
    });

    test('only returns users matching the requested snowflake ids', async () => {
        const user = await createUser();
        const other = await createUser();

        const found = await repo.findByIds([user.snowflakeId]);

        expect(found.map((u) => u.snowflakeId)).toEqual([user.snowflakeId]);
        expect(found.map((u) => u.snowflakeId)).not.toContain(
            other.snowflakeId,
        );
    });
});
