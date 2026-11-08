import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Bot } from '@/models/Bot';

import { MongooseBotRepository } from './MongooseBotRepository';

let mongod: MongoMemoryServer;
const repo = new MongooseBotRepository();

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

describe('MongooseBotRepository', () => {
    it('finds a bot by its user id, without the token hash', async () => {
        await Bot.create({
            clientId: 'client-1',
            botTokenHash: 'secret-hash',
            userId: 'bot-user-1',
            ownerId: 'owner-1',
        });

        const bot = await repo.findByUserId('bot-user-1');

        expect(bot?.clientId).toBe('client-1');
        expect(bot?.botTokenHash).toBeUndefined();
        expect(await repo.findByUserId('someone-else')).toBeNull();
    });
});
