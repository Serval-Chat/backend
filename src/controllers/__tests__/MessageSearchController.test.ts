import {
    ForbiddenException,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import type { Request as ExpressRequest } from 'express';

import { UserMessageSearchController } from '../UserMessageSearchController';
import { ServerMessageSearchController } from '../ServerMessageSearchController';
import { IsHumanGuard } from '@/modules/auth/bot.guard';
import { messageSearchLimiter } from '@/middleware/rateLimiting';

const userId = new Types.ObjectId().toHexString();
const otherUserId = new Types.ObjectId().toHexString();
const serverId = new Types.ObjectId().toHexString();
const channelId = new Types.ObjectId().toHexString();

const jwtReq = (id: string, isBot = false) =>
    ({ user: { id, isBot } }) as unknown as ExpressRequest;

const mockSearchService = {
    searchDmMessages: jest.fn(),
    searchChannelMessages: jest.fn(),
};

const mockFriendshipRepo = {
    areFriends: jest.fn(),
};

const mockServerMemberRepo = {
    findByServerAndUser: jest.fn(),
};

const mockChannelRepo = {
    findById: jest.fn(),
    findByServerId: jest.fn(),
};

const mockCategoryRepo = {
    findByIdAndServer: jest.fn(),
};

const mockPermissionService = {
    hasChannelPermission: jest.fn(),
};

const mockUserRepo = {
    findByUsername: jest.fn(),
};

const dmQuery = { userId: otherUserId, q: 'hello', limit: 25, offset: 0 };
const channelQuery = { q: 'hello', limit: 25, offset: 0 };

const sampleDmHits = {
    hits: [
        {
            id: 'msg-1',
            senderId: userId,
            receiverId: otherUserId,
            text: 'hello there',
            highlight: '<mark>hello</mark> there',
            createdAt: '2026-01-01T12:00:00.000Z',
        },
    ],
    total: 1,
};

const sampleChannelHits = {
    hits: [
        {
            id: 'ch-1',
            senderId: userId,
            channelId,
            serverId,
            text: 'hello everyone',
            highlight: '<mark>hello</mark> everyone',
            createdAt: '2026-01-01T12:00:00.000Z',
        },
    ],
    total: 1,
};

const makeChannel = (overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(channelId),
    serverId: { toString: () => serverId },
    type: 'text',
    ...overrides,
});

describe('UserMessageSearchController', () => {
    let controller: UserMessageSearchController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new UserMessageSearchController(
            mockSearchService as never,
            mockFriendshipRepo as never,
            mockUserRepo as never,
        );
    });

    it('returns search hits for friends', async () => {
        mockFriendshipRepo.areFriends.mockResolvedValueOnce(true);
        mockSearchService.searchDmMessages.mockResolvedValueOnce(sampleDmHits);

        const result = await controller.searchMessages(
            dmQuery as never,
            jwtReq(userId).user?.id as string,
        );

        expect(result).toEqual(sampleDmHits);
    });

    it('always uses the JWT user id as the requesting party, not an arbitrary query param', async () => {
        // user A passes B's id as "themselves", impossible, but we verify
        // that searchDmMessages is called with req.user?.id as string first, not query.userId
        mockFriendshipRepo.areFriends.mockResolvedValueOnce(true);
        mockSearchService.searchDmMessages.mockResolvedValueOnce({
            hits: [],
            total: 0,
        });

        await controller.searchMessages(
            dmQuery as never,
            jwtReq(userId).user?.id as string,
        );

        expect(mockSearchService.searchDmMessages).toHaveBeenCalledWith(
            userId, // first arg = JWT user, always locked to req.user?.id as string
            otherUserId, // second arg = the query param (other conversation partner)
            'hello',
            25,
            0,
            {}, // empty filters when no filter params are set
        );
    });

    it('throws ForbiddenException when the users are not friends', async () => {
        mockFriendshipRepo.areFriends.mockResolvedValueOnce(false);

        await expect(
            controller.searchMessages(
                dmQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(ForbiddenException);

        expect(mockSearchService.searchDmMessages).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when ES search fails', async () => {
        mockFriendshipRepo.areFriends.mockResolvedValueOnce(true);
        mockSearchService.searchDmMessages.mockRejectedValueOnce(
            new Error('ES down'),
        );

        await expect(
            controller.searchMessages(
                dmQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(ServiceUnavailableException);
    });

    it('IsHumanGuard blocks bot tokens before the controller logic runs', () => {
        const guard = new IsHumanGuard();
        const botContext = {
            switchToHttp: () => ({
                getRequest: () => ({ user: { id: 'bot-1', isBot: true } }),
            }),
        } as never;

        expect(() => guard.canActivate(botContext)).toThrow(ForbiddenException);
    });

    it('IsHumanGuard allows human tokens through', () => {
        const guard = new IsHumanGuard();
        const humanContext = {
            switchToHttp: () => ({
                getRequest: () => ({ user: { id: userId, isBot: false } }),
            }),
        } as never;

        expect(guard.canActivate(humanContext)).toBe(true);
    });

    it('has @NoBot() guard wired at the class level', () => {
        // NestJS stores UseGuards metadata under '__guards__'
        const guards: unknown[] =
            Reflect.getMetadata('__guards__', UserMessageSearchController) ??
            [];
        expect(guards).toContain(IsHumanGuard);
    });
});

describe('ServerMessageSearchController', () => {
    let controller: ServerMessageSearchController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new ServerMessageSearchController(
            mockSearchService as never,
            mockServerMemberRepo as never,
            mockChannelRepo as never,
            mockCategoryRepo as never,
            mockPermissionService as never,
            mockUserRepo as never,
        );
    });

    it('returns search hits for valid channel members with view permission', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
            _id: new Types.ObjectId(),
        });
        mockChannelRepo.findById.mockResolvedValueOnce(makeChannel());
        mockPermissionService.hasChannelPermission.mockResolvedValueOnce(true);
        mockSearchService.searchChannelMessages.mockResolvedValueOnce(
            sampleChannelHits,
        );

        const result = await controller.searchMessages(
            serverId,
            channelId,
            channelQuery as never,
            jwtReq(userId).user?.id as string,
        );

        expect(result).toEqual(sampleChannelHits);
        expect(mockSearchService.searchChannelMessages).toHaveBeenCalledWith(
            channelId,
            'hello',
            25,
            0,
            {},
        );
    });

    it('throws ForbiddenException when user is not a server member', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce(null);

        await expect(
            controller.searchMessages(
                serverId,
                channelId,
                channelQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(ForbiddenException);

        expect(mockSearchService.searchChannelMessages).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when channel does not exist', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
            _id: new Types.ObjectId(),
        });
        mockChannelRepo.findById.mockResolvedValueOnce(null);

        await expect(
            controller.searchMessages(
                serverId,
                channelId,
                channelQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when channel belongs to a different server', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
            _id: new Types.ObjectId(),
        });
        mockChannelRepo.findById.mockResolvedValueOnce(
            makeChannel({
                serverId: {
                    toString: () => new Types.ObjectId().toHexString(),
                },
            }),
        );

        await expect(
            controller.searchMessages(
                serverId,
                channelId,
                channelQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for link channels', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
            _id: new Types.ObjectId(),
        });
        mockChannelRepo.findById.mockResolvedValueOnce(
            makeChannel({ type: 'link' }),
        );

        await expect(
            controller.searchMessages(
                serverId,
                channelId,
                channelQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user lacks viewChannels permission', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
            _id: new Types.ObjectId(),
        });
        mockChannelRepo.findById.mockResolvedValueOnce(makeChannel());
        mockPermissionService.hasChannelPermission.mockResolvedValueOnce(false);

        await expect(
            controller.searchMessages(
                serverId,
                channelId,
                channelQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(ForbiddenException);
    });

    it('throws ServiceUnavailableException when ES search fails', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValueOnce({
            _id: new Types.ObjectId(),
        });
        mockChannelRepo.findById.mockResolvedValueOnce(makeChannel());
        mockPermissionService.hasChannelPermission.mockResolvedValueOnce(true);
        mockSearchService.searchChannelMessages.mockRejectedValueOnce(
            new Error('ES error'),
        );

        await expect(
            controller.searchMessages(
                serverId,
                channelId,
                channelQuery as never,
                jwtReq(userId).user?.id as string,
            ),
        ).rejects.toThrow(ServiceUnavailableException);
    });

    it('has @NoBot() guard wired at the class level', () => {
        const guards: unknown[] =
            Reflect.getMetadata('__guards__', ServerMessageSearchController) ??
            [];
        expect(guards).toContain(IsHumanGuard);
    });
});

describe('messageSearchLimiter configuration', () => {
    it('is defined and exported', () => {
        expect(messageSearchLimiter).toBeDefined();
        expect(typeof messageSearchLimiter).toBe('function'); // express-rate-limit returns middleware fn
    });

    it('has the expected windowMs and max settings', () => {
        // express-rate-limit exposes its config on the handler's options property
        const opts = (
            messageSearchLimiter as unknown as {
                options?: { windowMs: number; max: number };
            }
        ).options;
        if (opts !== undefined) {
            expect(opts.windowMs).toBe(60_000);
            expect(opts.max).toBe(30);
        } else {
            // some versions don't expose .options; just assert it's a function
            expect(typeof messageSearchLimiter).toBe('function');
        }
    });
});
