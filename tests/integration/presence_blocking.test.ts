/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setup, teardown } from './setup';
import { clearDatabase, createTestUser } from './helpers';
import type { IUser } from '../../src/models/User';
import { TYPES } from '../../src/di/types';
import { container } from '../../src/di/container';
import { PresenceController } from '../../src/ws/controller/PresenceController';
import { ServerMemberController } from '../../src/controllers/ServerMemberController';
import { BlockFlags } from '../../src/privacy/blockFlags';
import type { IWsUser } from '../../src/ws/types';
import type { IBlockRepository } from '../../src/di/interfaces/IBlockRepository';
import type { IFriendshipRepository } from '../../src/di/interfaces/IFriendshipRepository';
import type { Request } from 'express';

describe('Presence Blocking Integration', () => {
    let blocker: IUser, blocked: IUser;
    let presenceController: PresenceController;
    let mockWsServer: Record<string, jest.Mock>;

    beforeAll(async () => {
        await setup();
        
        mockWsServer = {
            broadcastToPresenceAudience: jest.fn(),
            broadcastToUser: jest.fn(),
            isUserOnline: jest.fn().mockResolvedValue(true), // Assume target is online
            on: jest.fn(),
            shutdown: jest.fn().mockResolvedValue(undefined),
        };

        container.rebind(TYPES.WsServer).toConstantValue(mockWsServer);
        
        presenceController = container.get(PresenceController);
    });

    afterAll(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
        jest.clearAllMocks();

        blocker = await createTestUser();
        blocked = await createTestUser();

        // make them friends so they are in each other's presence audience.
        const friendshipRepo = container.get<IFriendshipRepository>(TYPES.FriendshipRepository);
        await friendshipRepo.create(blocker.snowflakeId, blocked.snowflakeId);
    });

    async function setupBlock(blockerId: string, targetId: string, flags: number) {
        const blockRepo = container.get<IBlockRepository>(TYPES.BlockRepository);
        const profile = await blockRepo.createProfile(blockerId, 'Test Profile', flags);
        await blockRepo.upsertBlock(blockerId, targetId, profile.snowflakeId);
    }

    describe('sendPresenceSync (Initial Sync)', () => {
        it('should hide blocker from blocked user when HIDE_MY_PRESENCE is set', async () => {
            // blocker (User A) hides their presence from blocked (User B).
            await setupBlock(blocker.snowflakeId, blocked.snowflakeId, BlockFlags.HIDE_MY_PRESENCE);

            const wsUserB = { userId: blocked.snowflakeId, username: blocked.username || '' } as IWsUser;
            
            await presenceController.sendPresenceSync(wsUserB);

            // check what was sent to user B.
            const call = (mockWsServer.broadcastToUser as jest.Mock).mock.calls.find((c: unknown[]) => c[0] === wsUserB.userId);
            assert.ok(call !== undefined && call !== null, 'Should have sent presence sync');
            const syncPayload = call[1].payload;
            
            const foundBlocker = syncPayload.online.find((u: { userId: string }) => u.userId === blocker.snowflakeId);
            assert.equal(foundBlocker, undefined, 'Blocker should be hidden from blocked user initial sync due to HIDE_MY_PRESENCE');
        });

        it('should hide blocked user from blocker when HIDE_THEIR_PRESENCE is set', async () => {
            // blocker (User A) doesn't want to see blocked (User B).
            await setupBlock(blocker.snowflakeId, blocked.snowflakeId, BlockFlags.HIDE_THEIR_PRESENCE);

            const wsUserA = { userId: blocker.snowflakeId, username: blocker.username || '' } as IWsUser;
            
            await presenceController.sendPresenceSync(wsUserA);

            const call = (mockWsServer.broadcastToUser as jest.Mock).mock.calls.find((c: unknown[]) => c[0] === wsUserA.userId);
            assert.ok(call !== undefined && call !== null, 'Should have sent presence sync');
            const syncPayload = call[1].payload;
            
            const foundBlocked = syncPayload.online.find((u: { userId: string }) => u.userId === blocked.snowflakeId);
            assert.equal(foundBlocked, undefined, 'Blocked user should be hidden from blocker initial sync due to HIDE_THEIR_PRESENCE');
        });
    });

    describe('broadcastToPresenceAudience (Real-time Broadcast)', () => {
        it('should add blocked user to excluded list when HIDE_MY_PRESENCE is set', async () => {
            await setupBlock(blocker.snowflakeId, blocked.snowflakeId, BlockFlags.HIDE_MY_PRESENCE);

            // trigger some broadcast (e.g. status update).
            await (presenceController as any).broadcastToPresenceAudience(blocker.snowflakeId, { type: 'user_online', payload: {} });

            const call = (mockWsServer.broadcastToPresenceAudience as jest.Mock).mock.calls[0];
            assert.ok(call !== undefined && call !== null, 'Should have called broadcastToPresenceAudience');
            const excludedUserIds = call[4]; // 5th argument
            assert.ok((excludedUserIds as string[]).includes(blocked.snowflakeId), 'Blocked user should be in exclusion list');
        });

        it('should add blocker to excluded list when recipient has HIDE_THEIR_PRESENCE set', async () => {
            // blocked (User B) comes online.
            // blocker (User A) has HIDE_THEIR_PRESENCE on User B, so User A should not receive the event.
            await setupBlock(blocker.snowflakeId, blocked.snowflakeId, BlockFlags.HIDE_THEIR_PRESENCE);

            // user B (blocked) comes online.
            await (presenceController as any).broadcastToPresenceAudience(blocked.snowflakeId, { type: 'user_online', payload: {} });

            const call = (mockWsServer.broadcastToPresenceAudience as jest.Mock).mock.calls[0];
            assert.ok(call !== undefined && call !== null, 'Should have called broadcastToPresenceAudience');
            const excludedUserIds = call[4];
            assert.ok((excludedUserIds as string[]).includes(blocker.snowflakeId), 'Blocker should be in exclusion list because they hide the blocked user');
        });
    });

    describe('ServerMemberController (REST Member List)', () => {
        it('should hide blocker online status from blocked user in member list', async () => {
            const serverId = new mongoose.Types.ObjectId();
            
            const memberRepo = container.get<Record<string, jest.Mock>>(TYPES.ServerMemberRepository);
            memberRepo.findByServerAndUser = jest.fn().mockResolvedValue({ userId: blocked.snowflakeId });
            memberRepo.findByServerIdWithUserInfo = jest.fn().mockResolvedValue([
                { userId: blocker.snowflakeId, username: blocker.username },
                { userId: blocked.snowflakeId, username: blocked.username },
            ]);

            const controller = new ServerMemberController(
                memberRepo as any,
                {} as any, // serverRepo
                {} as any, // userRepo
                {} as any, // roleRepo
                {} as any, // serverBanRepo
                {} as any, // permissionService
                container.get<ConstructorParameters<typeof ServerMemberController>[6]>(TYPES.Logger),
                mockWsServer as any,
                {} as any, // serverAuditLogService
                container.get<ConstructorParameters<typeof ServerMemberController>[9]>(TYPES.BlockRepository),
                container.get<ConstructorParameters<typeof ServerMemberController>[10]>(TYPES.PingService)
            );

            await setupBlock(blocker.snowflakeId, blocked.snowflakeId, BlockFlags.HIDE_MY_PRESENCE);

            const req = { user: { id: blocked.snowflakeId } } as Request;

            const members = await controller.getServerMembers(serverId.toString(), req.user?.id as string);

            const blockerMember = members.find((m: { userId: string | mongoose.Types.ObjectId, online: boolean }) => m.userId.toString() === blocker.snowflakeId);
            assert.ok(blockerMember, 'Blocker should still be in the list');
            assert.equal(blockerMember.online, false, 'Blocker should appear offline to the blocked user');
        });
    });
});
