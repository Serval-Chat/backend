import { Message } from '@/models/Message';
import { Reaction } from '@/models/Reaction';

import { MongooseMessageRepository } from './MongooseMessageRepository';

const chain = (result: unknown) => ({
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
});

describe('MongooseMessageRepository deleted message retention', () => {
    const repo = new MongooseMessageRepository();
    const cutoff = new Date('2026-11-02T11:30:00.000Z');

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('filters expired deleted messages from privileged ID lookups', async () => {
        const query = chain(null);
        const findOne = jest
            .spyOn(Message, 'findOne')
            .mockReturnValue(query as never);

        await repo.findById('message-id', true, cutoff);

        expect(findOne).toHaveBeenCalledWith({
            $and: [
                { snowflakeId: 'message-id' },
                {
                    $or: [
                        { deletedAt: { $exists: false } },
                        { deletedAt: { $gt: cutoff } },
                    ],
                },
            ],
        });
    });

    it('filters expired deleted messages from paginated channel reads', async () => {
        const query = chain([]);
        const find = jest
            .spyOn(Message, 'find')
            .mockReturnValue(query as never);

        await repo.findByChannelId(
            'channel-id',
            50,
            undefined,
            undefined,
            undefined,
            true,
            cutoff,
        );

        expect(find).toHaveBeenCalledWith({
            $and: [
                { channelId: 'channel-id' },
                {
                    $or: [
                        { deletedAt: { $exists: false } },
                        { deletedAt: { $gt: cutoff } },
                    ],
                },
            ],
        });
    });

    it('filters expired deleted messages from pinned results', async () => {
        const query = chain([]);
        const find = jest
            .spyOn(Message, 'find')
            .mockReturnValue(query as never);

        await repo.findPinnedByChannelId('channel-id', true, cutoff);

        expect(find).toHaveBeenCalledWith({
            $and: [
                { channelId: 'channel-id' },
                { $or: [{ isPinned: true }, { isSticky: true }] },
                {
                    $or: [
                        { deletedAt: { $exists: false } },
                        { deletedAt: { $gt: cutoff } },
                    ],
                },
            ],
        });
    });

    it('removes an expired deleted reply preview even if a mock database returns it', async () => {
        const expiredParent = {
            snowflakeId: 'parent-id',
            senderId: 'sender-id',
            channelId: 'channel-id',
            text: 'expired reply text',
            deletedAt: new Date(cutoff.getTime() - 1),
        };
        const query = chain({
            snowflakeId: 'reply-id',
            senderId: 'reply-sender',
            channelId: 'channel-id',
            text: 'reply text',
            repliedToMessage: expiredParent,
        });
        jest.spyOn(Message, 'findOne').mockReturnValue(query as never);

        const reply = await repo.findById('reply-id', true, cutoff);

        expect(reply).not.toHaveProperty('referenced_message');
    });

    it('does not change an existing deletion timestamp during bulk delete', async () => {
        const updateMany = jest
            .spyOn(Message, 'updateMany')
            .mockResolvedValue({ modifiedCount: 0 } as never);

        await repo.bulkSoftDelete('channel-id', ['message-id']);

        expect(updateMany).toHaveBeenCalledWith(
            {
                channelId: 'channel-id',
                snowflakeId: { $in: ['message-id'] },
                deletedAt: { $exists: false },
            },
            { $set: { deletedAt: expect.any(Date) } },
        );
    });

    it('hard-deletes only deleted messages from the requested server and their reactions', async () => {
        jest.spyOn(Message, 'find').mockReturnValue(
            chain([{ snowflakeId: 'm1' }, { snowflakeId: 'm2' }]) as never,
        );
        const deleteReactions = jest
            .spyOn(Reaction, 'deleteMany')
            .mockResolvedValue({ deletedCount: 2 } as never);
        const deleteMany = jest
            .spyOn(Message, 'deleteMany')
            .mockResolvedValue({ deletedCount: 4 } as never);

        await expect(
            repo.hardDeleteDeletedByServerId('server-id'),
        ).resolves.toBe(4);

        expect(deleteMany).toHaveBeenCalledWith({
            serverId: 'server-id',
            deletedAt: { $exists: true },
        });
        expect(deleteReactions).toHaveBeenCalledWith({
            messageType: 'server',
            messageId: { $in: ['m1', 'm2'] },
        });
    });
});
