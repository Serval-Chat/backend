/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { UserMessageController } from '../UserMessageController';
import type { JWTPayload } from '@/utils/jwt';
import type { Request } from 'express';

describe('UserMessageController', () => {
    const meId = new Types.ObjectId();
    const peerId = new Types.ObjectId();
    const meIdStr = meId.toHexString();
    const peerIdStr = peerId.toHexString();

    const mockUserRepo = {
        findById: jest.fn(),
    };
    const mockFriendshipRepo = {
        areFriends: jest.fn(),
    };
    const mockMessageRepo = {
        findByConversation: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };
    const mockDmUnreadRepo = {
        findByUser: jest.fn(),
        delete: jest.fn(),
    };
    const mockReactionRepo = {
        getReactionsForMessages: jest.fn(),
    };
    const mockLogger = {
        error: jest.fn(),
        warn: jest.fn(),
    };
    const mockWsServer = {
        broadcastToUser: jest.fn(),
    };

    let controller: UserMessageController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new UserMessageController(
            mockUserRepo as any,
            mockFriendshipRepo as any,
            mockMessageRepo as any,
            mockDmUnreadRepo as any,
            mockReactionRepo as any,
            mockLogger as any,
            mockWsServer as any,
            {
                processServerMessage: jest.fn().mockResolvedValue(undefined),
                processUserMessage: jest.fn().mockResolvedValue(undefined),
            } as any,
            {
                removeDmMessage: jest.fn().mockResolvedValue(undefined),
            } as never,
        );
    });

    describe('getUnreadCounts', () => {
        const req = {
            user: { id: meIdStr } as JWTPayload,
        } as Request;

        it('returns unread counts for friends', async () => {
            mockDmUnreadRepo.findByUser.mockResolvedValue([
                { peer: peerId, count: 5 },
            ]);
            mockFriendshipRepo.areFriends.mockResolvedValue(true);

            const result = await controller.getUnreadCounts(
                req.user?.id as string,
            );

            expect(result.counts).toEqual({ [peerIdStr]: 5 });
            expect(mockDmUnreadRepo.delete).not.toHaveBeenCalled();
        });

        it('cleans up and filters out unread counts from non-friends', async () => {
            mockDmUnreadRepo.findByUser.mockResolvedValue([
                { peer: peerId, count: 5 },
            ]);
            mockFriendshipRepo.areFriends.mockResolvedValue(false);

            const result = await controller.getUnreadCounts(
                req.user?.id as string,
            );

            expect(result.counts).toEqual({});
            expect(mockDmUnreadRepo.delete).toHaveBeenCalledWith(
                meIdStr,
                peerId,
            );
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        it('ignores non-friends with zero unread count (no cleanup needed)', async () => {
            mockDmUnreadRepo.findByUser.mockResolvedValue([
                { peer: peerId, count: 0 },
            ]);
            mockFriendshipRepo.areFriends.mockResolvedValue(false);

            const result = await controller.getUnreadCounts(
                req.user?.id as string,
            );

            expect(result.counts).toEqual({});
            expect(mockDmUnreadRepo.delete).not.toHaveBeenCalled();
        });
    });
});
