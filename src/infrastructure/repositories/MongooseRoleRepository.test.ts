import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Role } from '@/models/Server';

import { MongooseRoleRepository } from './MongooseRoleRepository';

let mongod: MongoMemoryServer;
const repo = new MongooseRoleRepository();

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

describe('MongooseRoleRepository.findManagedByBot', () => {
    it("returns only the bot's managed role in that server", async () => {
        await Role.create([
            { serverId: 's1', name: 'Plain', managedBotId: 'bot-1' },
            {
                serverId: 's2',
                name: 'Elsewhere',
                managed: true,
                managedBotId: 'bot-1',
            },
            {
                serverId: 's1',
                name: 'Other bot',
                managed: true,
                managedBotId: 'bot-2',
            },
            {
                serverId: 's1',
                name: 'Bot 1',
                managed: true,
                managedBotId: 'bot-1',
            },
        ]);

        const role = await repo.findManagedByBot('s1', 'bot-1');

        expect(role?.name).toBe('Bot 1');
        expect(await repo.findManagedByBot('s3', 'bot-1')).toBeNull();
    });
});
