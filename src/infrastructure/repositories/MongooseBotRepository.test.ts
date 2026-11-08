import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Bot } from '@/models/Bot';
import { User } from '@/models/User';

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

    describe('admin listing and verification', () => {
        beforeAll(async () => {
            await Bot.deleteMany({});
            const bots = [
                { n: 1, requested: false },
                { n: 2, requested: true },
                { n: 3, requested: true },
            ];
            for (const { n, requested } of bots) {
                const user = await User.create({
                    username: `listbot${n}`,
                    login: `listbot${n}@example.com`,
                    password: 'password123',
                    isBot: true,
                });
                await Bot.create({
                    clientId: `list-client-${n}`,
                    botTokenHash: 'hash',
                    userId: user.snowflakeId,
                    ownerId: 'owner',
                    verificationRequested: requested,
                });
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
        });

        it('lists newest first with the bot user populated, paged', async () => {
            const page = await repo.listForAdmin({ limit: 2, offset: 0 });

            expect(page.map((b) => b.clientId)).toEqual([
                'list-client-3',
                'list-client-2',
            ]);
            expect(page[0]?.userIdUser?.username).toBe('listbot3');
            expect(
                (await repo.listForAdmin({ limit: 2, offset: 2 })).map(
                    (b) => b.clientId,
                ),
            ).toEqual(['list-client-1']);
        });

        it('filters by bot user ids, including an empty match list', async () => {
            const target = await repo.findByClientId('list-client-1');

            const filtered = await repo.listForAdmin({
                userIds: [target?.userId ?? 'missing'],
                limit: 10,
                offset: 0,
            });
            expect(filtered.map((b) => b.clientId)).toEqual(['list-client-1']);
            expect(
                await repo.listForAdmin({ userIds: [], limit: 10, offset: 0 }),
            ).toEqual([]);
        });

        it('lists and counts bots awaiting review, then updates verification', async () => {
            expect(
                (await repo.listAwaitingReview({ limit: 10, offset: 0 })).map(
                    (b) => b.clientId,
                ),
            ).toEqual(['list-client-3', 'list-client-2']);
            expect(await repo.countAwaitingReview()).toBe(2);

            await repo.updateVerification('list-client-2', {
                verified: true,
                verificationOverride: 'verified',
                verificationRequested: false,
            });

            const updated = await repo.findByClientId('list-client-2');
            expect(updated).toMatchObject({
                verified: true,
                verificationOverride: 'verified',
                verificationRequested: false,
            });
            expect(await repo.countAwaitingReview()).toBe(1);
        });
    });
});
