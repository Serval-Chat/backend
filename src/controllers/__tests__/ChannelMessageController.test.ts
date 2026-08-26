/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChannelMessageController } from '../ChannelMessageController';

const mockChannelRepo = {
    findById: jest.fn(),
};
const mockMessageRepo = {
    findByChannelId: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    hardDelete: jest.fn(),
    setPollVote: jest.fn(),
};
const mockReactionRepo = {
    getReactionsForMessages: jest.fn(),
};
const mockSearchService = {
    searchDmMessages: jest.fn(),
    removeDmMessage: jest.fn(),
};
const mockUserRepo = {
    findByUsername: jest.fn(),
    findByUsernames: jest.fn(),
};
const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
};
const mockWsServer = {
    broadcastToUser: jest.fn(),
};
const mockEmbedService = {
    processUserMessage: jest.fn().mockResolvedValue(undefined),
};

function buildController(): ChannelMessageController {
    return new ChannelMessageController(
        mockChannelRepo as any,
        mockMessageRepo as any,
        mockReactionRepo as any,
        mockSearchService as any,
        mockUserRepo as any,
        mockLogger as any,
        mockWsServer as any,
        mockEmbedService as any,
    );
}

describe('ChannelMessageController - getMessages', () => {
    let controller: ChannelMessageController;
    const userId = 'userA';
    const channelId = 'chan1';

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
    });

    it('returns messages with reactions for a DM channel the user belongs to', async () => {
        mockChannelRepo.findById.mockResolvedValue({
            snowflakeId: channelId,
            type: 'dm',
            recipientIds: [userId, 'userB'],
        });
        mockMessageRepo.findByChannelId.mockResolvedValue([
            { snowflakeId: 'msg1', text: 'hi' },
        ]);
        mockReactionRepo.getReactionsForMessages.mockResolvedValue({
            msg1: [{ emoji: '👍' }],
        });

        const result = await controller.getMessages({ channelId }, userId, {
            limit: 50,
        });

        expect(mockMessageRepo.findByChannelId).toHaveBeenCalledWith(
            channelId,
            50,
            undefined,
            undefined,
            undefined,
        );
        expect(result).toEqual([
            { snowflakeId: 'msg1', text: 'hi', reactions: [{ emoji: '👍' }] },
        ]);
    });

    it('rejects when the channel does not exist', async () => {
        mockChannelRepo.findById.mockResolvedValue(null);

        await expect(
            controller.getMessages({ channelId }, userId, { limit: 50 } as any),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a guild channel id (not a dm/group_dm channel)', async () => {
        mockChannelRepo.findById.mockResolvedValue({
            snowflakeId: channelId,
            type: 'text',
            serverId: 'server1',
        });

        await expect(
            controller.getMessages({ channelId }, userId, { limit: 50 } as any),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a user who is not a recipient of the DM channel', async () => {
        mockChannelRepo.findById.mockResolvedValue({
            snowflakeId: channelId,
            type: 'dm',
            recipientIds: ['userB', 'userC'],
        });

        await expect(
            controller.getMessages({ channelId }, userId, { limit: 50 } as any),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockMessageRepo.findByChannelId).not.toHaveBeenCalled();
    });
});

describe('ChannelMessageController - editMessage', () => {
    let controller: ChannelMessageController;
    const userId = 'userA';
    const channelId = 'chan1';
    const messageId = 'msg1';

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
        mockChannelRepo.findById.mockResolvedValue({
            snowflakeId: channelId,
            type: 'dm',
            recipientIds: [userId, 'userB'],
        });
    });

    it('edits a message the caller sent and broadcasts to both participants', async () => {
        mockMessageRepo.findById.mockResolvedValue({
            snowflakeId: messageId,
            channelId,
            senderId: userId,
            receiverId: 'userB',
        });
        mockMessageRepo.update.mockResolvedValue({
            snowflakeId: messageId,
            text: 'edited',
            editedAt: new Date('2026-01-01T00:00:00.000Z'),
        });

        const result = await controller.editMessage(
            { channelId, messageId },
            userId,
            { content: 'edited' },
        );

        expect(mockMessageRepo.update).toHaveBeenCalledWith(
            messageId,
            'edited',
        );
        expect(result.text).toBe('edited');
        expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ type: 'message_dm_edited' }),
        );
        expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
            'userB',
            expect.objectContaining({ type: 'message_dm_edited' }),
        );
    });

    it('rejects editing a message sent by someone else', async () => {
        mockMessageRepo.findById.mockResolvedValue({
            snowflakeId: messageId,
            channelId,
            senderId: 'userB',
            receiverId: userId,
        });

        await expect(
            controller.editMessage({ channelId, messageId }, userId, {
                content: 'nope',
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockMessageRepo.update).not.toHaveBeenCalled();
    });

    it('rejects when the message does not belong to this channel', async () => {
        mockMessageRepo.findById.mockResolvedValue({
            snowflakeId: messageId,
            channelId: 'chan-other',
            senderId: userId,
            receiverId: 'userB',
        });

        await expect(
            controller.editMessage({ channelId, messageId }, userId, {
                content: 'nope',
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('ChannelMessageController - deleteMessage', () => {
    let controller: ChannelMessageController;
    const userId = 'userA';
    const channelId = 'chan1';
    const messageId = 'msg1';

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
        mockChannelRepo.findById.mockResolvedValue({
            snowflakeId: channelId,
            type: 'dm',
            recipientIds: [userId, 'userB'],
        });
    });

    it('deletes a message the caller sent and broadcasts to both participants', async () => {
        mockMessageRepo.findById.mockResolvedValue({
            snowflakeId: messageId,
            channelId,
            senderId: userId,
            receiverId: 'userB',
        });
        mockMessageRepo.hardDelete.mockResolvedValue(true);
        mockSearchService.removeDmMessage.mockResolvedValue(undefined);

        const result = await controller.deleteMessage(
            { channelId, messageId },
            userId,
        );

        expect(result).toEqual({ success: true });
        expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ type: 'message_dm_deleted' }),
        );
        expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
            'userB',
            expect.objectContaining({ type: 'message_dm_deleted' }),
        );
    });

    it('rejects deleting a message sent by someone else', async () => {
        mockMessageRepo.findById.mockResolvedValue({
            snowflakeId: messageId,
            channelId,
            senderId: 'userB',
            receiverId: userId,
        });

        await expect(
            controller.deleteMessage({ channelId, messageId }, userId),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(mockMessageRepo.hardDelete).not.toHaveBeenCalled();
    });
});

describe('ChannelMessageController - votePoll', () => {
    let controller: ChannelMessageController;
    const userId = 'userA';
    const channelId = 'chan1';
    const messageId = 'msg1';

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
        mockChannelRepo.findById.mockResolvedValue({
            snowflakeId: channelId,
            type: 'dm',
            recipientIds: [userId, 'userB'],
        });
    });

    it('registers a vote and broadcasts the updated poll', async () => {
        mockMessageRepo.findById.mockResolvedValue({
            snowflakeId: messageId,
            channelId,
            senderId: 'userB',
            receiverId: userId,
            poll: {
                title: 'Pick one',
                multiSelect: false,
                options: [{ id: 'opt1', text: 'A', votes: [] }],
            },
        });
        mockMessageRepo.setPollVote.mockResolvedValue({
            snowflakeId: messageId,
            poll: {
                title: 'Pick one',
                multiSelect: false,
                options: [{ id: 'opt1', text: 'A', votes: [userId] }],
            },
        });

        await controller.votePoll({ channelId, messageId }, userId, {
            optionIds: ['opt1'],
        });

        expect(mockMessageRepo.setPollVote).toHaveBeenCalledWith(
            messageId,
            userId,
            ['opt1'],
        );
        expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ type: 'poll_vote_updated_dm' }),
        );
    });

    it('rejects voting on a message with no poll', async () => {
        mockMessageRepo.findById.mockResolvedValue({
            snowflakeId: messageId,
            channelId,
            senderId: 'userB',
            receiverId: userId,
        });

        await expect(
            controller.votePoll({ channelId, messageId }, userId, {
                optionIds: ['opt1'],
            }),
        ).rejects.toThrow('This message does not contain a poll.');
    });
});

describe('ChannelMessageController - searchMessages', () => {
    let controller: ChannelMessageController;
    const userId = 'userA';
    const channelId = 'chan1';

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
        mockChannelRepo.findById.mockResolvedValue({
            snowflakeId: channelId,
            type: 'dm',
            recipientIds: [userId, 'userB'],
        });
    });

    it('delegates to searchDmMessages with the other recipient resolved from the channel', async () => {
        mockSearchService.searchDmMessages.mockResolvedValue({
            hits: [{ id: 'msg1' }],
            total: 1,
        });

        const result = await controller.searchMessages({ channelId }, userId, {
            q: 'hello',
            limit: 25,
            offset: 0,
        });

        expect(mockSearchService.searchDmMessages).toHaveBeenCalledWith(
            userId,
            'userB',
            'hello',
            25,
            0,
            expect.any(Object),
        );
        expect(result.total).toBe(1);
    });

    it('resolves fromUser/mentionsUser filters via a single batched lookup', async () => {
        mockSearchService.searchDmMessages.mockResolvedValue({
            hits: [],
            total: 0,
        });
        mockUserRepo.findByUsernames.mockResolvedValue([
            { username: 'alice', snowflakeId: 'alice-id' },
            { username: 'bob', snowflakeId: 'bob-id' },
        ]);

        await controller.searchMessages({ channelId }, userId, {
            q: 'hello',
            limit: 25,
            offset: 0,
            fromUser: 'alice',
            mentionsUser: 'bob',
        });

        expect(mockUserRepo.findByUsernames).toHaveBeenCalledTimes(1);
        expect(mockUserRepo.findByUsernames).toHaveBeenCalledWith([
            'alice',
            'bob',
        ]);
        expect(mockUserRepo.findByUsername).not.toHaveBeenCalled();
        expect(mockSearchService.searchDmMessages).toHaveBeenCalledWith(
            userId,
            'userB',
            'hello',
            25,
            0,
            expect.objectContaining({
                fromUserId: 'alice-id',
                mentionsUserId: 'bob-id',
            }),
        );
    });

    it('returns no results when fromUser does not resolve to a real user', async () => {
        mockUserRepo.findByUsernames.mockResolvedValue([]);

        const result = await controller.searchMessages({ channelId }, userId, {
            q: 'hello',
            limit: 25,
            offset: 0,
            fromUser: 'ghost',
        });

        expect(result).toEqual({ hits: [], total: 0 });
        expect(mockSearchService.searchDmMessages).not.toHaveBeenCalled();
    });
});
