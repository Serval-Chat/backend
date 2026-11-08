/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { Types } from 'mongoose';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminController } from '../../src/controllers/AdminController';
import { createMockRequest } from '../utils/test-utils';
import type { AuthenticatedRequest } from '../../src/middleware/auth';

const CLIENT_ID = '0123456789abcdef0123456789abcdef';

describe('AdminController bot verification', () => {
    let mockUserRepo: Record<string, jest.Mock>;
    let mockAuditLogRepo: Record<string, jest.Mock>;
    let mockBotRepo: Record<string, jest.Mock>;
    let mockServerMemberRepo: Record<string, jest.Mock>;
    let controller: AdminController;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUserRepo = {
            findById: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
            update: jest.fn().mockResolvedValue(null),
            updatePermissions: jest.fn(),
            findBotIdsMatching: jest.fn(),
        };
        mockBotRepo = {
            findByClientId: jest.fn(),
            listForAdmin: jest.fn().mockResolvedValue([]),
            listAwaitingReview: jest.fn().mockResolvedValue([]),
            countAwaitingReview: jest.fn().mockResolvedValue(0),
            updateVerification: jest.fn(),
        };
        mockServerMemberRepo = {
            countServersByUserIds: jest.fn().mockResolvedValue(new Map()),
        };
        mockAuditLogRepo = {
            create: jest.fn().mockResolvedValue({}),
            find: jest.fn().mockResolvedValue([]),
        };

        controller = new AdminController(
            mockUserRepo as any,
            mockAuditLogRepo as any,
            {} as any,
            { broadcastToServer: jest.fn() } as any,
            {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn(),
            },
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            mockServerMemberRepo as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            mockBotRepo as any,
            {} as any,
            {} as any,
        );
    });

    describe('listBots', () => {
        it('maps bots with owner details, defaulting verification fields when unset on legacy documents', async () => {
            const ownerId = new Types.ObjectId().toHexString();
            mockBotRepo.listForAdmin!.mockResolvedValue(
                [
                    {
                        snowflakeId: 'bot-1',
                        clientId: CLIENT_ID,
                        userId: 'bot-user-1',
                        ownerId,
                        createdAt: new Date('2024-01-01T00:00:00.000Z'),
                        userIdUser: {
                            username: 'mybot',
                            displayName: 'My Bot',
                            profilePicture: 'bot.webp',
                        },
                        // legacy document: no verified/verificationRequested/verificationOverride
                    },
                ],
            );
            (mockUserRepo.findByIds as jest.Mock).mockResolvedValue([
                {
                    id: ownerId,
                    username: 'owner1',
                    displayName: null,
                    profilePicture: undefined,
                },
            ]);
            mockServerMemberRepo.countServersByUserIds!.mockResolvedValue(
                new Map([['bot-user-1', 3]]),
            );

            const result = await controller.listBots(50, 0, undefined);

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: 'bot-1',
                clientId: CLIENT_ID,
                username: 'mybot',
                displayName: 'My Bot',
                profilePicture: '/api/v1/profile/picture/bot.webp',
                ownerId,
                serverCount: 3,
                verified: false,
                verificationRequested: false,
                verificationOverride: null,
            });
            expect(result[0]?.owner).toMatchObject({
                id: ownerId,
                username: 'owner1',
            });
        });

        it('scopes the bot search to bot accounts matching username/displayName', async () => {
            mockUserRepo.findBotIdsMatching!.mockResolvedValue(['bot-user-1']);

            await controller.listBots(50, 0, 'mybot');

            expect(mockUserRepo.findBotIdsMatching).toHaveBeenCalledWith(
                'mybot',
            );
            expect(mockBotRepo.listForAdmin).toHaveBeenCalledWith({
                userIds: ['bot-user-1'],
                limit: 50,
                offset: 0,
            });
        });
    });

    describe('listAwaitingReviewBots', () => {
        it('queries only bots with a pending verification request', async () => {
            const result = await controller.listAwaitingReviewBots(50, 0);

            expect(mockBotRepo.listAwaitingReview).toHaveBeenCalledWith({
                limit: 50,
                offset: 0,
            });
            expect(mockBotRepo.countAwaitingReview).toHaveBeenCalled();
            expect(result).toEqual({ items: [], total: 0 });
        });
    });

    describe('declineBotVerification', () => {
        it('throws NotFoundException when there is no pending request', async () => {
            mockBotRepo.findByClientId!.mockResolvedValue(
                {
                    clientId: CLIENT_ID,
                    ownerId: 'owner-1',
                    verificationRequested: false,
                },
            );

            const req = createMockRequest({
                user: { id: 'admin-1' },
            }) as AuthenticatedRequest;

            await expect(
                controller.declineBotVerification(CLIENT_ID, req),
            ).rejects.toThrow(NotFoundException);
            expect(mockBotRepo.updateVerification).not.toHaveBeenCalled();
        });

        it('clears verificationRequested and logs the action', async () => {
            mockBotRepo.findByClientId!.mockResolvedValue(
                {
                    clientId: CLIENT_ID,
                    ownerId: 'owner-1',
                    verificationRequested: true,
                },
            );

            const req = createMockRequest({
                user: { id: 'admin-1' },
            }) as AuthenticatedRequest;

            const result = await controller.declineBotVerification(
                CLIENT_ID,
                req,
            );

            expect(mockBotRepo.updateVerification).toHaveBeenCalledWith(
                CLIENT_ID,
                { verificationRequested: false },
            );
            expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    actionType: 'decline_bot_verification',
                    targetUserId: 'owner-1',
                }),
            );
            expect(result).toEqual({
                message: 'Verification application declined.',
            });
        });
    });

    describe('setBotVerificationOverride', () => {
        it('forces verified=true and syncs the bot user botVerified flag', async () => {
            mockBotRepo.findByClientId!.mockResolvedValue(
                {
                    clientId: CLIENT_ID,
                    ownerId: 'owner-1',
                    userId: 'bot-user-1',
                    verified: false,
                    verificationRequested: true,
                },
            );

            const req = createMockRequest({
                user: { id: 'admin-1' },
            }) as AuthenticatedRequest;

            const result = await controller.setBotVerificationOverride(
                CLIENT_ID,
                { override: 'verified' },
                req,
            );

            expect(mockBotRepo.updateVerification).toHaveBeenCalledWith(
                CLIENT_ID,
                {
                    verified: true,
                    verificationOverride: 'verified',
                    verificationRequested: false,
                },
            );
            expect(mockUserRepo.update).toHaveBeenCalledWith('bot-user-1', {
                botVerified: true,
            });
            expect(result).toEqual({ verified: true, override: 'verified' });
        });

        it('clearing the override preserves the current verified state and pending request flag', async () => {
            mockBotRepo.findByClientId!.mockResolvedValue(
                {
                    clientId: CLIENT_ID,
                    ownerId: 'owner-1',
                    userId: 'bot-user-1',
                    verified: true,
                    verificationRequested: false,
                    verificationOverride: 'verified',
                },
            );

            const req = createMockRequest({
                user: { id: 'admin-1' },
            }) as AuthenticatedRequest;

            const result = await controller.setBotVerificationOverride(
                CLIENT_ID,
                { override: null },
                req,
            );

            expect(mockBotRepo.updateVerification).toHaveBeenCalledWith(
                CLIENT_ID,
                {
                    verified: true,
                    verificationOverride: null,
                    verificationRequested: false,
                },
            );
            expect(result).toEqual({ verified: true, override: null });
        });
    });

    describe('verifyBot', () => {
        it('throws BadRequestException when verification was never requested', async () => {
            mockBotRepo.findByClientId!.mockResolvedValue(
                {
                    clientId: CLIENT_ID,
                    ownerId: 'owner-1',
                    userId: 'bot-user-1',
                    verificationRequested: false,
                },
            );

            const req = createMockRequest({
                user: { id: 'admin-1' },
            }) as AuthenticatedRequest;

            await expect(
                controller.verifyBot(CLIENT_ID, req),
            ).rejects.toThrow(BadRequestException);
            expect(mockBotRepo.updateVerification).not.toHaveBeenCalled();
            expect(mockUserRepo.update).not.toHaveBeenCalled();
        });

        it('grants the badge, syncs the bot user, and logs the action', async () => {
            mockBotRepo.findByClientId!.mockResolvedValue(
                {
                    clientId: CLIENT_ID,
                    ownerId: 'owner-1',
                    userId: 'bot-user-1',
                    verificationRequested: true,
                },
            );

            const req = createMockRequest({
                user: { id: 'admin-1' },
            }) as AuthenticatedRequest;

            const result = await controller.verifyBot(CLIENT_ID, req);

            expect(mockBotRepo.updateVerification).toHaveBeenCalledWith(
                CLIENT_ID,
                {
                    verified: true,
                    verificationOverride: 'verified',
                    verificationRequested: false,
                },
            );
            expect(mockUserRepo.update).toHaveBeenCalledWith('bot-user-1', {
                botVerified: true,
            });
            expect(mockAuditLogRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    actionType: 'verify_bot',
                    targetUserId: 'owner-1',
                }),
            );
            expect(result).toEqual({ verified: true });
        });
    });

    describe('unverifyBot', () => {
        it('revokes the badge and syncs the bot user regardless of request state', async () => {
            mockBotRepo.findByClientId!.mockResolvedValue(
                {
                    clientId: CLIENT_ID,
                    ownerId: 'owner-1',
                    userId: 'bot-user-1',
                    verified: true,
                },
            );

            const req = createMockRequest({
                user: { id: 'admin-1' },
            }) as AuthenticatedRequest;

            const result = await controller.unverifyBot(CLIENT_ID, req);

            expect(mockBotRepo.updateVerification).toHaveBeenCalledWith(
                CLIENT_ID,
                { verified: false, verificationOverride: 'unverified' },
            );
            expect(mockUserRepo.update).toHaveBeenCalledWith('bot-user-1', {
                botVerified: false,
            });
            expect(result).toEqual({ verified: false });
        });
    });
});
