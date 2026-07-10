/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
import { ServerMessageController } from '../ServerMessageController';
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import type { Request } from 'express';
import type { IServerMessage } from '@/di/interfaces/IServerMessageRepository';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';
import type { IAuditLogRepository } from '@/di/interfaces/IAuditLogRepository';
import type { SendMessageRequestDTO } from '../dto/server-message.request.dto';
import type { PollVoteRequestDTO } from '../dto/poll-vote.request.dto';
import type { IPoll, IPollOption } from '@/models/Message';

const hex = () => new Types.ObjectId().toHexString();

const SERVER_ID = hex();
const CHANNEL_ID = hex();
const USER_ID = hex();
const MSG_ID = hex();

function makePoll(overrides: Partial<IPoll> = {}): IPoll {
    return {
        title: 'Best fruit?',
        multiSelect: false,
        options: [
            { id: hex(), text: 'Apple', votes: [] },
            { id: hex(), text: 'Banana', votes: [] },
        ] as IPollOption[],
        ...overrides,
    };
}

function makeMessage(poll: IPoll | undefined = makePoll()): IServerMessage {
    return {
        _id: new Types.ObjectId(MSG_ID),
        serverId: SERVER_ID,
        channelId: CHANNEL_ID,
        senderId: USER_ID,
        text: '',
        createdAt: new Date(),
        poll,
    } as IServerMessage;
}

function makeReq(userId = USER_ID): Request {
    return {
        user: { id: userId, username: 'testuser', isBot: false },
    } as Request;
}

function applyPollVote(
    poll: IPoll,
    userId: string,
    optionIds: string[],
): IPoll {
    return {
        ...poll,
        options: poll.options.map((opt) => {
            const votes = opt.votes.filter((v) => v.toString() !== userId);
            if (optionIds.includes(opt.id)) {
                votes.push(userId);
            }
            return { ...opt, votes };
        }),
    };
}

let mockServerMessageRepo: {
    findByChannelId: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    setPollVote: jest.Mock;
};
let mockMemberRepo: {
    findByServerAndUser: jest.Mock;
};
let mockChannelRepo: {
    findById: jest.Mock;
    updateLastMessageAt: jest.Mock;
};
let mockReactionRepo: {
    getReactionsForMessages: jest.Mock;
};
let mockPermissionService: {
    hasChannelPermission: jest.Mock;
    requireChannelPermission: jest.Mock;
};
let mockWsServer: {
    broadcastToServer: jest.Mock;
    broadcastToChannel: jest.Mock;
    broadcastToServerWithPermission: jest.Mock;
};
let mockLogger: ILogger;
let controller: ServerMessageController;

function buildController(): void {
    controller = new ServerMessageController(
        mockServerMessageRepo as any,
        mockMemberRepo as any,
        mockChannelRepo as any,
        mockReactionRepo as any,
        mockPermissionService as any,
        mockLogger,
        mockWsServer as any,
        {} as IAuditLogRepository,
        {} as IServerAuditLogService,
        {
            findById: jest.fn().mockResolvedValue({
                _id: new Types.ObjectId(SERVER_ID),
                ownerId: new Types.ObjectId(),
            }),
        } as any,
        {
            processServerMessage: jest.fn().mockResolvedValue(undefined),
            processUserMessage: jest.fn().mockResolvedValue(undefined),
        } as any,
        {
            getClient: jest.fn().mockReturnValue({
                pipeline: jest.fn().mockReturnValue({
                    set: jest.fn(),
                    exec: jest.fn().mockResolvedValue([]),
                }),
            }),
        } as never,
        {
            indexChannelMessage: jest.fn().mockResolvedValue(undefined),
            removeChannelMessage: jest.fn().mockResolvedValue(undefined),
        } as never,
    );
}

beforeEach(() => {
    mockServerMessageRepo = {
        findByChannelId: jest.fn().mockResolvedValue([]),
        findById: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        setPollVote: jest.fn(),
    };

    mockMemberRepo = {
        findByServerAndUser: jest.fn().mockResolvedValue({ userId: USER_ID }),
    };

    mockChannelRepo = {
        findById: jest.fn().mockResolvedValue({
            _id: new Types.ObjectId(CHANNEL_ID),
            serverId: SERVER_ID,
            type: 'text',
        }),
        updateLastMessageAt: jest.fn().mockResolvedValue(undefined),
    };

    mockReactionRepo = {
        getReactionsForMessages: jest.fn().mockResolvedValue({}),
    };

    mockPermissionService = {
        hasChannelPermission: jest.fn().mockResolvedValue(true),
        requireChannelPermission: jest.fn(async function (
            this: {
                hasChannelPermission: (...args: unknown[]) => Promise<boolean>;
            },
            serverId: unknown,
            userId: unknown,
            channelId: unknown,
            permission: unknown,
            error: Error,
        ) {
            if (
                (await this.hasChannelPermission(
                    serverId,
                    userId,
                    channelId,
                    permission,
                )) !== true
            ) {
                throw error;
            }
        }),
    };

    mockWsServer = {
        broadcastToServer: jest.fn().mockResolvedValue(undefined),
        broadcastToChannel: jest.fn().mockResolvedValue(undefined),
        broadcastToServerWithPermission: jest.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
    };

    buildController();
});

describe('sendMessage  -  poll creation', () => {
    it('creates a message with a poll attached', async () => {
        const poll = makePoll();
        mockServerMessageRepo.create.mockResolvedValue(makeMessage(poll));

        const body = {
            content: 'Vote!',
            poll: {
                title: 'Best fruit?',
                multiSelect: false,
                options: [{ text: 'Apple' }, { text: 'Banana' }],
            },
        } as SendMessageRequestDTO;

        const result = await controller.sendMessage(
            SERVER_ID,
            CHANNEL_ID,
            USER_ID,
            false,
            'testuser',
            body,
        );
        expect(mockServerMessageRepo.create).toHaveBeenCalledTimes(1);
        expect(result.poll).toBeDefined();
    });

    it('assigns a unique non-empty string id and empty votes to each option', async () => {
        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.create.mockImplementation(async (data) => {
            capturedPoll = data.poll as IPoll;
            return makeMessage(capturedPoll);
        });

        const body = {
            content: 'Vote!',
            poll: {
                title: 'Colours',
                multiSelect: false,
                options: [{ text: 'Red' }, { text: 'Blue' }, { text: 'Green' }],
            },
        } as SendMessageRequestDTO;

        await controller.sendMessage(
            SERVER_ID,
            CHANNEL_ID,
            USER_ID,
            false,
            'testuser',
            body,
        );

        expect(capturedPoll!.options).toHaveLength(3);
        const ids = capturedPoll!.options.map((o) => o.id);
        ids.forEach((id) => expect(typeof id).toBe('string'));
        ids.forEach((id) => expect(id.length).toBeGreaterThan(0));
        expect(new Set(ids).size).toBe(3);
        capturedPoll!.options.forEach((o) => expect(o.votes).toEqual([]));
    });

    it('parses a valid ISO expiresAt string into a Date', async () => {
        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.create.mockImplementation(async (data) => {
            capturedPoll = data.poll as IPoll;
            return makeMessage(capturedPoll);
        });

        const future = new Date(Date.now() + 3_600_000).toISOString();
        const body = {
            content: 'Vote!',
            poll: {
                title: 'Expiring',
                multiSelect: false,
                options: [{ text: 'Yes' }, { text: 'No' }],
                expiresAt: future,
            },
        } as SendMessageRequestDTO;

        await controller.sendMessage(
            SERVER_ID,
            CHANNEL_ID,
            USER_ID,
            false,
            'testuser',
            body,
        );

        expect(capturedPoll!.expiresAt).toBeInstanceOf(Date);
        expect(capturedPoll!.expiresAt!.toISOString()).toBe(future);
    });

    it('omits expiresAt when it is an empty string', async () => {
        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.create.mockImplementation(async (data) => {
            capturedPoll = data.poll as IPoll;
            return makeMessage(capturedPoll);
        });

        const body = {
            content: 'Vote!',
            poll: {
                title: 'No expiry',
                multiSelect: false,
                options: [{ text: 'A' }, { text: 'B' }],
                expiresAt: '',
            },
        } as SendMessageRequestDTO;

        await controller.sendMessage(
            SERVER_ID,
            CHANNEL_ID,
            USER_ID,
            false,
            'testuser',
            body,
        );
        expect(capturedPoll!.expiresAt).toBeUndefined();
    });

    it('creates a message without a poll when poll is omitted', async () => {
        const noPollMsg: IServerMessage = {
            _id: new Types.ObjectId(MSG_ID),
            serverId: SERVER_ID,
            channelId: CHANNEL_ID,
            senderId: USER_ID,
            text: 'No poll here',
            createdAt: new Date(),
        } as IServerMessage;
        mockServerMessageRepo.create.mockResolvedValue(noPollMsg);

        const body = {
            content: 'No poll here',
        } as SendMessageRequestDTO;
        const result = await controller.sendMessage(
            SERVER_ID,
            CHANNEL_ID,
            USER_ID,
            false,
            'testuser',
            body,
        );
        expect(result.poll).toBeUndefined();
    });

    it('includes the poll in the WS broadcast payload', async () => {
        const poll = makePoll();
        mockServerMessageRepo.create.mockResolvedValue(makeMessage(poll));

        const body = {
            content: 'Vote!',
            poll: {
                title: 'Best fruit?',
                multiSelect: false,
                options: [{ text: 'Apple' }, { text: 'Banana' }],
            },
        } as SendMessageRequestDTO;

        await controller.sendMessage(
            SERVER_ID,
            CHANNEL_ID,
            USER_ID,
            false,
            'testuser',
            body,
        );

        const calls = mockWsServer.broadcastToServerWithPermission.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const [calledServerId, calledPayload] = calls[0]!;
        expect(calledServerId).toBe(SERVER_ID);
        expect(calledPayload).toMatchObject({
            type: 'message_server',
            payload: expect.objectContaining({ poll }),
        });
    });
});

describe('votePoll  -  access control', () => {
    it('throws ForbiddenException when user is not a server member', async () => {
        mockMemberRepo.findByServerAndUser.mockResolvedValue(null);

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user lacks viewChannels permission', async () => {
        mockPermissionService.hasChannelPermission.mockResolvedValue(false);

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when message does not exist', async () => {
        mockServerMessageRepo.findById.mockResolvedValue(null);

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when message belongs to a different channel', async () => {
        const msg = { ...makeMessage(), channelId: new Types.ObjectId() };
        mockServerMessageRepo.findById.mockResolvedValue(msg);

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(NotFoundException);
    });
});

describe('votePoll  -  poll validation', () => {
    it('throws BadRequestException when the message has no poll', async () => {
        const msgWithoutPoll: IServerMessage = {
            _id: new Types.ObjectId(MSG_ID),
            serverId: SERVER_ID,
            channelId: CHANNEL_ID,
            senderId: USER_ID,
            text: '',
            createdAt: new Date(),
        } as IServerMessage;

        mockServerMessageRepo.findById.mockResolvedValue(msgWithoutPoll);

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the poll has expired', async () => {
        const poll = makePoll({ expiresAt: new Date(Date.now() - 60_000) });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        const body: PollVoteRequestDTO = { optionIds: [poll.options[0]!.id] };
        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                body,
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('does not throw when poll has a future expiresAt', async () => {
        const poll = makePoll({ expiresAt: new Date(Date.now() + 3_600_000) });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(makeMessage(poll));

        const body: PollVoteRequestDTO = { optionIds: [poll.options[0]!.id] };
        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                body,
                makeReq().user?.id as string,
            ),
        ).resolves.toBeDefined();
    });

    it('throws BadRequestException when an option ID is invalid', async () => {
        const poll = makePoll();
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        const body: PollVoteRequestDTO = { optionIds: ['nonexistent-id'] };
        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                body,
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when multiple options chosen on a single-select poll', async () => {
        const poll = makePoll({ multiSelect: false });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        const body: PollVoteRequestDTO = {
            optionIds: [poll.options[0]!.id, poll.options[1]!.id],
        };
        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                body,
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('allows multiple options on a multi-select poll', async () => {
        const poll = makePoll({ multiSelect: true });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(makeMessage(poll));

        const body: PollVoteRequestDTO = {
            optionIds: [poll.options[0]!.id, poll.options[1]!.id],
        };
        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                body,
                makeReq().user?.id as string,
            ),
        ).resolves.toBeDefined();
    });
});

describe('votePoll  -  vote mutation logic', () => {
    it("adds the user ObjectId to the selected option's votes array", async () => {
        const poll = makePoll();
        const targetId = poll.options[0]!.id;
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.setPollVote.mockImplementation(
            async (_id, userId, optionIds) => {
                capturedPoll = applyPollVote(poll, userId, optionIds);
                return makeMessage(capturedPoll);
            },
        );

        await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [targetId] },
            makeReq().user?.id as string,
        );

        const target = capturedPoll!.options.find((o) => o.id === targetId);
        expect(target!.votes).toHaveLength(1);
        expect(target!.votes[0]!.toString()).toBe(USER_ID);
    });

    it('removes the user from all other options (single-select)', async () => {
        const otherId = hex();
        const targetId = hex();
        const poll: IPoll = {
            title: 'Pick one',
            multiSelect: false,
            options: [
                {
                    id: otherId,
                    text: 'Other',
                    votes: [USER_ID],
                },
                { id: targetId, text: 'Target', votes: [] },
            ] as IPollOption[],
        };
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.setPollVote.mockImplementation(
            async (_id, userId, optionIds) => {
                capturedPoll = applyPollVote(poll, userId, optionIds);
                return makeMessage(capturedPoll);
            },
        );

        await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [targetId] },
            makeReq().user?.id as string,
        );

        const other = capturedPoll!.options.find((o) => o.id === otherId);
        const target = capturedPoll!.options.find((o) => o.id === targetId);
        expect(other!.votes).toHaveLength(0);
        expect(target!.votes).toHaveLength(1);
    });

    it('de-selects all options when optionIds is empty', async () => {
        const optId = hex();
        const poll: IPoll = {
            title: 'Toggle',
            multiSelect: false,
            options: [
                { id: optId, text: 'A', votes: [USER_ID] },
                { id: hex(), text: 'B', votes: [] },
            ] as IPollOption[],
        };
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.setPollVote.mockImplementation(
            async (_id, userId, optionIds) => {
                capturedPoll = applyPollVote(poll, userId, optionIds);
                return makeMessage(capturedPoll);
            },
        );

        await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [] },
            makeReq().user?.id as string,
        );

        capturedPoll!.options.forEach((o) => expect(o.votes).toHaveLength(0));
    });

    it("preserves other users' votes while adding the current user", async () => {
        const anotherUser = hex();
        const optId = hex();
        const poll: IPoll = {
            title: 'Multi users',
            multiSelect: false,
            options: [
                { id: optId, text: 'Popular', votes: [anotherUser] },
                { id: hex(), text: 'Other', votes: [] },
            ] as IPollOption[],
        };
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.setPollVote.mockImplementation(
            async (_id, userId, optionIds) => {
                capturedPoll = applyPollVote(poll, userId, optionIds);
                return makeMessage(capturedPoll);
            },
        );

        await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [optId] },
            makeReq().user?.id as string,
        );

        const target = capturedPoll!.options.find((o) => o.id === optId);
        expect(target!.votes).toHaveLength(2);
    });

    it("does not duplicate the user's vote when voting for the same option twice", async () => {
        const optId = hex();
        const poll: IPoll = {
            title: 'No dup',
            multiSelect: false,
            options: [
                { id: optId, text: 'A', votes: [USER_ID] },
                { id: hex(), text: 'B', votes: [] },
            ] as IPollOption[],
        };
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        let capturedPoll: IPoll | undefined;
        mockServerMessageRepo.setPollVote.mockImplementation(
            async (_id, userId, optionIds) => {
                capturedPoll = applyPollVote(poll, userId, optionIds);
                return makeMessage(capturedPoll);
            },
        );

        await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [optId] },
            makeReq().user?.id as string,
        );

        const target = capturedPoll!.options.find((o) => o.id === optId);
        expect(target!.votes).toHaveLength(1);
    });
});

describe('votePoll  -  WebSocket broadcast', () => {
    it('broadcasts poll_vote_updated_server to the correct channel', async () => {
        const poll = makePoll();
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(makeMessage(poll));

        await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [poll.options[0]!.id] },
            makeReq().user?.id as string,
        );

        expect(mockWsServer.broadcastToChannel).toHaveBeenCalledTimes(1);
        expect(mockWsServer.broadcastToChannel).toHaveBeenCalledWith(
            CHANNEL_ID,
            expect.objectContaining({ type: 'poll_vote_updated_server' }),
        );
    });

    it('broadcast payload includes messageId, serverId, channelId, and poll', async () => {
        const poll = makePoll();
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(makeMessage(poll));

        await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [poll.options[0]!.id] },
            makeReq().user?.id as string,
        );

        expect(mockWsServer.broadcastToChannel).toHaveBeenCalledWith(
            CHANNEL_ID,
            expect.objectContaining({
                payload: expect.objectContaining({
                    messageId: MSG_ID,
                    serverId: SERVER_ID,
                    channelId: CHANNEL_ID,
                    poll: expect.any(Object),
                }),
            }),
        );
    });

    it('does NOT broadcast when repo.update returns null', async () => {
        const poll = makePoll();
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(null);

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [poll.options[0]!.id] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(NotFoundException);

        expect(mockWsServer.broadcastToChannel).not.toHaveBeenCalled();
    });
});

describe('votePoll  -  return value', () => {
    it('returns the updated message object from the repository', async () => {
        const poll = makePoll();
        const updatedMsg = { ...makeMessage(poll), text: 'updated' };
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(updatedMsg);

        const result = await controller.votePoll(
            SERVER_ID,
            CHANNEL_ID,
            MSG_ID,
            { optionIds: [poll.options[0]!.id] },
            makeReq().user?.id as string,
        );
        expect(result).toBe(updatedMsg);
    });
});

describe('Poll expiry edge cases', () => {
    it('rejects a vote when expiresAt is in the past', async () => {
        const poll = makePoll({ expiresAt: new Date(Date.now() - 10_000) });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [poll.options[0]!.id] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('accepts a vote when expiresAt is undefined (poll never expires)', async () => {
        const poll = makePoll({ expiresAt: undefined });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(makeMessage(poll));

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [poll.options[0]!.id] },
                makeReq().user?.id as string,
            ),
        ).resolves.toBeDefined();
    });

    it('rejects a vote for a poll that expired exactly 1 ms ago', async () => {
        const poll = makePoll({ expiresAt: new Date(Date.now() - 1) });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [poll.options[0]!.id] },
                makeReq().user?.id as string,
            ),
        ).rejects.toThrow(BadRequestException);
    });

    it('accepts a vote for a poll expiring in the far future', async () => {
        const poll = makePoll({
            expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
        });
        mockServerMessageRepo.findById.mockResolvedValue(makeMessage(poll));
        mockServerMessageRepo.setPollVote.mockResolvedValue(makeMessage(poll));

        await expect(
            controller.votePoll(
                SERVER_ID,
                CHANNEL_ID,
                MSG_ID,
                { optionIds: [poll.options[0]!.id] },
                makeReq().user?.id as string,
            ),
        ).resolves.toBeDefined();
    });
});
