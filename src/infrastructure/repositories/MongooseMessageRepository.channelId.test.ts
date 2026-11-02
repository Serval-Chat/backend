import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { Message } from '@/models/Message';

import { MongooseMessageRepository } from './MongooseMessageRepository';

let mongod: MongoMemoryServer;
let repo: MongooseMessageRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseMessageRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await Message.deleteMany({});
});

describe('MongooseMessageRepository.findByChannelId', () => {
    test('returns only messages in the given channel, oldest first', async () => {
        const chanA = await repo.create({
            senderId: 'userA',
            receiverId: 'userB',
            channelId: 'chanA',
            text: 'first',
        });
        const chanA2 = await repo.create({
            senderId: 'userB',
            receiverId: 'userA',
            channelId: 'chanA',
            text: 'second',
        });
        await repo.create({
            senderId: 'userA',
            receiverId: 'userC',
            channelId: 'chanB',
            text: 'other conversation',
        });

        const results = await repo.findByChannelId('chanA');

        expect(results.map((m) => m.snowflakeId)).toEqual([
            chanA.snowflakeId,
            chanA2.snowflakeId,
        ]);
    });

    test('respects limit and pagination via before', async () => {
        const first = await repo.create({
            senderId: 'userA',
            receiverId: 'userB',
            channelId: 'chanA',
            text: '1',
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const second = await repo.create({
            senderId: 'userA',
            receiverId: 'userB',
            channelId: 'chanA',
            text: '2',
        });

        const page = await repo.findByChannelId('chanA', 1);
        expect(page.map((m) => m.snowflakeId)).toEqual([second.snowflakeId]);

        const olderPage = await repo.findByChannelId(
            'chanA',
            50,
            second.snowflakeId,
        );
        expect(olderPage.map((m) => m.snowflakeId)).toEqual([
            first.snowflakeId,
        ]);
    });
});

describe('MongooseMessageRepository message history', () => {
    test('stores text revisions without exposing them through normal reads', async () => {
        const message = await repo.create({
            senderId: 'userA',
            receiverId: 'userB',
            channelId: 'history-channel',
            text: 'Foooz',
        });
        const firstEditAt = new Date('2026-10-01T12:00:00.000Z');
        const secondEditAt = new Date('2026-10-01T12:01:00.000Z');

        await repo.updateMessage(message.snowflakeId, {
            text: 'Foz',
            editedAt: firstEditAt,
            isEdited: true,
        });
        await repo.updateMessage(message.snowflakeId, {
            text: 'Foo',
            editedAt: secondEditAt,
            isEdited: true,
        });
        await repo.updateMessage(message.snowflakeId, {
            embeds: [{ title: 'Embed update' }],
        });

        const normalRead = await repo.findById(message.snowflakeId);
        expect(normalRead).not.toHaveProperty('editHistory');

        const [contextMessage] = await repo.findContextAround(
            'history-channel',
            message.snowflakeId,
        );
        expect(contextMessage).toEqual(
            expect.objectContaining({
                text: 'Foo',
                editedAt: secondEditAt,
                editHistory: [
                    {
                        start: 2,
                        removedText: 'oo',
                        insertedText: '',
                        editedAt: firstEditAt,
                    },
                    {
                        start: 2,
                        removedText: 'z',
                        insertedText: 'o',
                        editedAt: secondEditAt,
                    },
                ],
            }),
        );
    });

    test('returns ten visible neighbors on either side in chronological order', async () => {
        const baseTime = new Date('2026-10-01T12:00:00.000Z').getTime();
        const messages = await Promise.all(
            Array.from({ length: 23 }, (_, index) =>
                repo.create({
                    senderId: index % 2 === 0 ? 'userA' : 'userB',
                    receiverId: index % 2 === 0 ? 'userB' : 'userA',
                    channelId: 'context-channel',
                    text: `message-${index}`,
                }),
            ),
        );
        await Promise.all(
            messages.map((message, index) =>
                Message.updateOne(
                    { snowflakeId: message.snowflakeId },
                    { $set: { createdAt: new Date(baseTime + index) } },
                ),
            ),
        );
        const deletedMessage = messages[10];
        const target = messages[11];
        if (!deletedMessage || !target) {
            throw new Error('Expected message fixture was not created');
        }
        await Message.updateOne(
            { snowflakeId: deletedMessage.snowflakeId },
            { $set: { deletedAt: new Date(baseTime + 100) } },
        );

        const visibleContext = await repo.findContextAround(
            'context-channel',
            target.snowflakeId,
        );
        expect(visibleContext.map((message) => message.text)).toEqual([
            ...Array.from({ length: 10 }, (_, index) => `message-${index}`),
            'message-11',
            ...Array.from(
                { length: 10 },
                (_, index) => `message-${index + 12}`,
            ),
        ]);

        const contextIncludingDeleted = await repo.findContextAround(
            'context-channel',
            target.snowflakeId,
            10,
            10,
            true,
        );
        expect(contextIncludingDeleted).toHaveLength(21);
        expect(contextIncludingDeleted.map((message) => message.text)).toEqual([
            ...Array.from({ length: 9 }, (_, index) => `message-${index + 1}`),
            'message-10',
            'message-11',
            ...Array.from(
                { length: 10 },
                (_, index) => `message-${index + 12}`,
            ),
        ]);
    });
});
