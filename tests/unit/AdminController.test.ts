/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { Types } from 'mongoose';
import { AdminController } from '../../src/controllers/AdminController';
import { createTestUser, createMockRequest } from '../utils/test-utils';
import { ProfileFieldDTO } from '../../src/controllers/dto/common.request.dto';
import type { AuthenticatedRequest } from '../../src/middleware/auth';
import { Badge } from '../../src/models/Badge';
import { UserConnection } from '../../src/models/UserConnection';

jest.mock('../../src/models/Badge', () => ({
    Badge: { find: jest.fn() },
}));
jest.mock('../../src/models/UserConnection', () => ({
    UserConnection: { find: jest.fn() },
}));

describe('AdminController', () => {
    let mockUserRepo: Record<string, jest.Mock>;
    let mockAuditLogRepo: Record<string, jest.Mock>;
    let mockFriendshipRepo: Record<string, jest.Mock>;
    let mockWsServer: Record<string, jest.Mock>;
    let mockLogger: Record<string, jest.Mock>;
    let mockBanRepo: Record<string, jest.Mock>;
    let mockServerRepo: Record<string, jest.Mock>;
    let mockMessageRepo: Record<string, jest.Mock>;
    let mockServerMessageRepo: Record<string, jest.Mock>;
    let mockWarningRepo: Record<string, jest.Mock>;
    let mockServerMemberRepo: Record<string, jest.Mock>;
    let mockChannelRepo: Record<string, jest.Mock>;
    let mockInviteRepo: Record<string, jest.Mock>;
    let mockAdminNoteRepo: Record<string, jest.Mock>;
    let mockServerVerificationService: Record<string, jest.Mock>;
    let mockServerDiscoveryService: Record<string, jest.Mock>;
    let mockMuteRepo: Record<string, jest.Mock>;

    let controller: AdminController;
    const getMockServerRepo = (): Record<string, jest.Mock> => mockServerRepo;

    beforeEach(() => {
        mockUserRepo = {
            findById: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
            updatePermissions: jest.fn(),
        };
        mockAuditLogRepo = {
            create: jest.fn(),
            find: jest.fn().mockResolvedValue([]),
        };
        mockFriendshipRepo = {} as Record<string, jest.Mock>;
        mockWsServer = {
            getUserSockets: jest.fn().mockReturnValue([]),
            broadcastToServer: jest.fn(),
        };
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        };
        mockBanRepo = {
            createOrUpdateWithHistory: jest.fn(),
            deactivateAllForUser: jest.fn(),
            findActiveByUserId: jest.fn().mockResolvedValue(null),
            findAll: jest.fn().mockResolvedValue([]),
        };
        mockServerRepo = {
            findById: jest.fn(),
            update: jest.fn(),
            findByIds: jest.fn(),
            delete: jest.fn(),
            create: jest.fn(),
        };
        mockMessageRepo = {} as Record<string, jest.Mock>;
        mockServerMessageRepo = {} as Record<string, jest.Mock>;
        mockWarningRepo = {
            countByUserId: jest.fn().mockResolvedValue(0),
        };
        mockServerMemberRepo = {
            countByServerId: jest.fn(),
            findAllByUserId: jest.fn().mockResolvedValue([]),
        };
        mockChannelRepo = {
            findByServerId: jest.fn()
        };
        mockInviteRepo = {} as Record<string, jest.Mock>;
        mockAdminNoteRepo = {} as Record<string, jest.Mock>;
        mockServerVerificationService = {
            getStats: jest.fn(),
            recompute: jest.fn(),
        };
        mockServerDiscoveryService = {
            reindexPotentialServers: jest.fn(),
            refreshServer: jest.fn(),
            removeServer: jest.fn(),
        };
        mockMuteRepo = {
            findActiveByUserId: jest.fn(),
            findByUserId: jest.fn(),
            createOrUpdateWithHistory: jest.fn(),
            deactivateAllForUser: jest.fn(),
            checkExpired: jest.fn(),
            findAll: jest.fn().mockResolvedValue([]),
        };

        controller = new AdminController(
            mockUserRepo as any,
            mockAuditLogRepo as any,
            mockFriendshipRepo as any,
            mockWsServer as any,
            mockLogger as any,
            mockBanRepo as any,
            mockMuteRepo as any,
            mockServerRepo as any,
            mockMessageRepo as any,
            mockServerMessageRepo as any,
            mockWarningRepo as any,
            mockServerMemberRepo as any,
            mockChannelRepo as any,
            mockInviteRepo as any,
            mockAdminNoteRepo as any,
            mockServerVerificationService as any,
            mockServerDiscoveryService as any,
        );
    });

    it('resetUserProfile resets banner', async () => {
        const userId = new Types.ObjectId().toString();
        const testUser = createTestUser({ _id: new Types.ObjectId(userId), banner: 'old-banner.png' });

        (mockUserRepo.findById as jest.Mock).mockResolvedValue(testUser);
        (mockUserRepo.update as jest.Mock).mockImplementation(async (id: string | Types.ObjectId, data: Record<string, unknown>) => ({ ...testUser, ...data }));

        const mockReq = createMockRequest({
            user: { id: new Types.ObjectId().toString() }
        }) as AuthenticatedRequest;

        const result = await controller.resetUserProfile(userId, { fields: [ProfileFieldDTO.BANNER] }, mockReq);

        expect(mockUserRepo.update as jest.Mock).toHaveBeenCalledTimes(1);
        const updateCall = (mockUserRepo.update as jest.Mock).mock.calls[0];
        expect(updateCall[0].toString()).toBe(userId);
        expect(updateCall[1]).toEqual({ banner: null });
        expect(result.message).toBe('User profile fields reset');
    });

    it('getUserNotes maps profile pictures correctly', async () => {
        const userId = new Types.ObjectId().toString();
        const adminId = new Types.ObjectId().toString();
        
        const mockNote = {
            _id: new Types.ObjectId(),
            targetId: new Types.ObjectId(userId),
            targetType: 'User',
            adminId,
            adminIdUser: {
                username: 'admin_user',
                displayName: 'Admin User',
                profilePicture: 'admin_pic.webp'
            },
            content: 'Test note',
            history: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            deletedBy: null,
            deleteReason: null
        };

        mockAdminNoteRepo.findByTarget = jest.fn().mockResolvedValue([mockNote]);

        const result = await controller.getUserNotes(userId);

        expect(result).toHaveLength(1);
        const note = result[0];
        if (note === undefined) throw new Error('note should not be undefined');
        expect(note.adminId.profilePicture).toBe('/api/v1/profile/picture/admin_pic.webp');
        expect(note.content).toBe('Test note');
        expect(note.history).toEqual([]);
    });

    it('getExtendedUserDetails (the actual GET /users/:userId/details route the admin panel calls) returns the complete profile payload, including colors, decoration, custom status, connections and privacy settings', async () => {
        const userId = new Types.ObjectId().toString();
        const testUser = createTestUser({
            snowflakeId: userId,
            username: 'testuser',
            login: 'testuser',
            displayName: 'Test User',
            profilePicture: 'avatar.webp',
            permissions: '0',
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            bio: 'hello there',
            pronouns: 'they/them',
            banner: 'banner.webp',
            badges: [],
            decorationId: 'decoration-1',
            bannerColor: '#e66100',
            profilePrimaryColor: '#000000',
            profileAccentColor: '#ff0000',
            usernameFont: 'Pacifico',
            usernameGradient: {
                enabled: true,
                colors: ['#5bcefa', '#f5a9b8'],
                angle: 360,
            },
            usernameGlow: { enabled: false, color: '#f7f2f5', intensity: 8 },
            customStatus: {
                text: 'I love Serchat',
                emoji: 'emoji-1',
                expiresAt: null,
                updatedAt: new Date('2024-01-02T00:00:00.000Z'),
            },
            privacySettings: {
                privateProfile: true,
                hideDisplayName: true,
                hidePronouns: true,
                hideConnections: true,
                hideBio: true,
                hideStatus: true,
            },
        });

        (mockUserRepo.findById as jest.Mock).mockResolvedValue(testUser);
        (mockBanRepo.findActiveByUserId as jest.Mock).mockResolvedValue(null);
        (mockMuteRepo.findActiveByUserId as jest.Mock).mockResolvedValue(null);
        (mockWarningRepo.countByUserId as jest.Mock).mockResolvedValue(3);
        mockServerMemberRepo.findByUserId = jest.fn().mockResolvedValue([]);
        (mockServerRepo.findByIds as jest.Mock).mockResolvedValue([]);
        (Badge.find as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
        });
        (UserConnection.find as jest.Mock).mockReturnValue({
            sort: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([
                    {
                        snowflakeId: 'conn-1',
                        type: 'Website',
                        value: 'ser.chat',
                        status: 'verified',
                    },
                ]),
            }),
        });

        const result = await controller.getExtendedUserDetails(userId);

        expect(result.decorationId).toBe('decoration-1');
        expect(result.bannerColor).toBe('#e66100');
        expect(result.profilePrimaryColor).toBe('#000000');
        expect(result.profileAccentColor).toBe('#ff0000');
        expect(result.usernameFont).toBe('Pacifico');
        expect(result.usernameGradient).toEqual({
            enabled: true,
            colors: ['#5bcefa', '#f5a9b8'],
            angle: 360,
        });
        expect(result.usernameGlow).toEqual({
            enabled: false,
            color: '#f7f2f5',
            intensity: 8,
        });
        expect(result.customStatus).toEqual({
            text: 'I love Serchat',
            emoji: 'emoji-1',
            expiresAt: null,
            updatedAt: '2024-01-02T00:00:00.000Z',
        });
        expect(result.isPrivate).toBe(true);
        expect(result.privacySettings).toEqual({
            privateProfile: true,
            hideDisplayName: true,
            hidePronouns: true,
            hideConnections: true,
            hideBio: true,
            hideStatus: true,
        });
        expect(result.connections).toEqual([
            {
                id: 'conn-1',
                type: 'Website',
                value: 'ser.chat',
                status: 'verified',
            },
        ]);
        expect(UserConnection.find).toHaveBeenCalledWith({
            userId,
            status: 'verified',
        });
    });

    it('listBans resolves userId and issuedBy to usernames, so the panel shows names instead of raw snowflakes', async () => {
        const bannedUserId = 'user-snowflake-1';
        const adminUserId = 'admin-snowflake-1';

        (mockBanRepo.findAll as jest.Mock).mockResolvedValue([
            {
                snowflakeId: 'ban-1',
                userId: bannedUserId,
                reason: 'spam',
                active: true,
                issuedBy: adminUserId,
                timestamp: new Date('2024-01-01T00:00:00.000Z'),
            },
        ]);
        (mockUserRepo.findByIds as jest.Mock).mockResolvedValue([
            {
                snowflakeId: bannedUserId,
                username: 'banneduser',
                displayName: 'Banned User',
                profilePicture: 'banned.webp',
            },
            {
                snowflakeId: adminUserId,
                username: 'moderator',
                displayName: 'Moderator Cat',
            },
        ]);

        const result = await controller.listBans(50, 0);

        expect(mockUserRepo.findByIds).toHaveBeenCalledWith(
            expect.arrayContaining([bannedUserId, adminUserId]),
        );
        expect(result[0]?.user).toMatchObject({
            id: bannedUserId,
            username: 'banneduser',
            displayName: 'Banned User',
            profilePicture: '/api/v1/profile/picture/banned.webp',
        });
        expect(result[0]?.issuedByUser).toMatchObject({
            id: adminUserId,
            username: 'moderator',
            displayName: 'Moderator Cat',
        });
    });

    it('listBans leaves user/issuedByUser unset when the account cannot be resolved, so the frontend falls back to the raw id', async () => {
        (mockBanRepo.findAll as jest.Mock).mockResolvedValue([
            {
                snowflakeId: 'ban-2',
                userId: 'deleted-user-id',
                reason: 'spam',
                active: true,
            },
        ]);
        (mockUserRepo.findByIds as jest.Mock).mockResolvedValue([]);

        const result = await controller.listBans(50, 0);

        expect(result[0]?.userId).toBe('deleted-user-id');
        expect(result[0]?.user).toBeUndefined();
        expect(result[0]?.issuedByUser).toBeUndefined();
    });

    it('listMutes resolves userId to a username the same way listBans does', async () => {
        const mutedUserId = 'user-snowflake-2';

        (mockMuteRepo.findAll as jest.Mock).mockResolvedValue([
            {
                snowflakeId: 'mute-1',
                userId: mutedUserId,
                reason: 'harassment',
                active: true,
            },
        ]);
        (mockUserRepo.findByIds as jest.Mock).mockResolvedValue([
            {
                snowflakeId: mutedUserId,
                username: 'mutedcat',
                displayName: null,
            },
        ]);

        const result = await controller.listMutes(50, 0);

        expect(result[0]?.user).toMatchObject({
            id: mutedUserId,
            username: 'mutedcat',
        });
    });

    it('listAuditLogs surfaces the already-populated actorIdUser/targetUserIdUser under the field names the frontend reads, and sets id from snowflakeId', async () => {
        const actorId = 'actor-snowflake-1';
        const targetUserId = 'target-snowflake-1';

        (mockAuditLogRepo.find as jest.Mock).mockResolvedValue([
            {
                snowflakeId: 'log-1',
                actorId,
                actorIdUser: {
                    username: 'moduser',
                    displayName: 'Mod User',
                    profilePicture: 'mod.webp',
                },
                actionType: 'ban_user',
                targetUserId,
                targetUserIdUser: {
                    username: 'targetuser',
                    displayName: 'Target User',
                },
                reason: 'spam',
                timestamp: new Date('2024-01-01T00:00:00.000Z'),
            },
        ]);

        const result = await controller.listAuditLogs({});

        expect(result[0]?.id).toBe('log-1');
        expect(result[0]?.actorId).toBe(actorId);
        expect(result[0]?.actorIdUser).toMatchObject({
            id: actorId,
            username: 'moduser',
            displayName: 'Mod User',
            profilePicture: '/api/v1/profile/picture/mod.webp',
        });
        expect(result[0]?.targetUserIdUser).toMatchObject({
            id: targetUserId,
            username: 'targetuser',
            displayName: 'Target User',
        });
    });

    describe('Server Verification', () => {
        it('verifyServer sets verified to true and creates an audit log', async () => {
            const serverId = new Types.ObjectId().toString();
            const mockServer = {
                _id: new Types.ObjectId(serverId),
                name: 'Test Server',
                verificationRequested: true,
                ownerId: new Types.ObjectId()
            };

            (getMockServerRepo().findById as jest.Mock).mockResolvedValue(mockServer);
            (getMockServerRepo().update as jest.Mock).mockResolvedValue({ ...mockServer, verified: true });
            
            mockAuditLogRepo.create = jest.fn().mockResolvedValue({});

            const mockReq = createMockRequest({
                user: { id: new Types.ObjectId().toString() }
            }) as AuthenticatedRequest;

            const result = await controller.verifyServer(serverId, mockReq);

            expect(mockServerRepo.findById).toHaveBeenCalledWith(serverId, true);
            expect(mockServerRepo.update).toHaveBeenCalledWith(serverId, { 
                verified: true,
                verificationOverride: 'verified',
                verificationRequested: false
            });
            expect(mockAuditLogRepo.create).toHaveBeenCalled();
            expect(mockAuditLogRepo.create.mock.calls[0][0]).toMatchObject({
                actionType: 'verify_server'
            });
            expect(result).toEqual({ verified: true });
        });

        it('unverifyServer sets verified to false and creates an audit log', async () => {
            const serverId = new Types.ObjectId().toString();
            const mockServer = {
                _id: new Types.ObjectId(serverId),
                name: 'Test Server',
                ownerId: new Types.ObjectId()
            };

            (getMockServerRepo().findById as jest.Mock).mockResolvedValue(mockServer);
            (getMockServerRepo().update as jest.Mock).mockResolvedValue({ ...mockServer, verified: false });
            mockAuditLogRepo.create = jest.fn().mockResolvedValue({});

            const mockReq = createMockRequest({
                user: { id: new Types.ObjectId().toString() }
            }) as AuthenticatedRequest;

            const result = await controller.unverifyServer(serverId, mockReq);

            expect(mockServerRepo.findById).toHaveBeenCalledWith(serverId, true);
            expect(mockServerRepo.update).toHaveBeenCalledWith(serverId, {
                verified: false,
                verificationOverride: 'unverified',
            });
            expect(mockAuditLogRepo.create).toHaveBeenCalled();
            expect(mockAuditLogRepo.create.mock.calls[0][0]).toMatchObject({
                actionType: 'unverify_server'
            });
            expect(result).toEqual({ verified: false });
        });
    });

    describe('Administrative Hierarchy Controls', () => {
        let superAdminUser: any;
        let adminUser: any;
        let adminUser2: any;
        let moderatorUser: any;

        beforeEach(() => {
            superAdminUser = createTestUser({
                _id: new Types.ObjectId(),
                permissions: { adminAccess: true, banUsers: true, warnUsers: true },
            });
            adminUser = createTestUser({
                _id: new Types.ObjectId(),
                permissions: { adminAccess: false, banUsers: true, warnUsers: true },
            });
            adminUser2 = createTestUser({
                _id: new Types.ObjectId(),
                permissions: { adminAccess: false, banUsers: true, warnUsers: true },
            });
            moderatorUser = createTestUser({
                _id: new Types.ObjectId(),
                permissions: { adminAccess: false, banUsers: false, warnUsers: true },
            });
        });

        it('should allow Super Admin to ban Admin', async () => {
            mockUserRepo.findById = jest.fn().mockImplementation(async (id: string) => {
                if (id === superAdminUser.snowflakeId) return superAdminUser;
                if (id === adminUser.snowflakeId) return adminUser;
                return null;
            });

            (mockBanRepo.createOrUpdateWithHistory as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(),
                userId: adminUser.snowflakeId,
                reason: 'ban test',
                active: true,
            });

            const mockReq = createMockRequest({
                user: { id: superAdminUser.snowflakeId },
            }) as AuthenticatedRequest;

            const result = await controller.banUser(
                adminUser.snowflakeId,
                { reason: 'ban test', duration: 60 },
                mockReq,
            );

            expect(result.userId).toBe(adminUser.snowflakeId);
        });

        it('should prevent Admin from banning another Admin', async () => {
            mockUserRepo.findById = jest.fn().mockImplementation(async (id: string) => {
                if (id === adminUser.snowflakeId) return adminUser;
                if (id === adminUser2.snowflakeId) return adminUser2;
                return null;
            });

            const mockReq = createMockRequest({
                user: { id: adminUser.snowflakeId },
            }) as AuthenticatedRequest;

            await expect(
                controller.banUser(
                    adminUser2.snowflakeId,
                    { reason: 'fail ban', duration: 60 },
                    mockReq,
                ),
            ).rejects.toThrow('Insufficient permissions');
        });

        it('should prevent Admin from banning Super Admin', async () => {
            mockUserRepo.findById = jest.fn().mockImplementation(async (id: string) => {
                if (id === adminUser.snowflakeId) return adminUser;
                if (id === superAdminUser.snowflakeId) return superAdminUser;
                return null;
            });

            const mockReq = createMockRequest({
                user: { id: adminUser.snowflakeId },
            }) as AuthenticatedRequest;

            await expect(
                controller.banUser(
                    superAdminUser.snowflakeId,
                    { reason: 'fail ban', duration: 60 },
                    mockReq,
                ),
            ).rejects.toThrow('Insufficient permissions');
        });

        it('should allow Admin to ban Moderator', async () => {
            mockUserRepo.findById = jest.fn().mockImplementation(async (id: string) => {
                if (id === adminUser.snowflakeId) return adminUser;
                if (id === moderatorUser.snowflakeId) return moderatorUser;
                return null;
            });

            (mockBanRepo.createOrUpdateWithHistory as jest.Mock).mockResolvedValue({
                _id: new Types.ObjectId(),
                userId: moderatorUser.snowflakeId,
                reason: 'ban mod',
                active: true,
            });

            const mockReq = createMockRequest({
                user: { id: adminUser.snowflakeId },
            }) as AuthenticatedRequest;

            const result = await controller.banUser(
                moderatorUser.snowflakeId,
                { reason: 'ban mod', duration: 60 },
                mockReq,
            );

            expect(result.userId).toBe(moderatorUser.snowflakeId);
        });

        it('should prevent Admin from promoting target to a rank equal or higher than their own', async () => {
            mockUserRepo.findById = jest.fn().mockImplementation(async (id: string) => {
                if (id === adminUser.snowflakeId) return adminUser;
                if (id === moderatorUser.snowflakeId) return moderatorUser;
                return null;
            });

            const mockReq = createMockRequest({
                user: { id: adminUser.snowflakeId },
            }) as AuthenticatedRequest;

            await expect(
                controller.updateUserPermissions(
                    moderatorUser.snowflakeId,
                    {
                        permissions: { adminAccess: true, banUsers: true, warnUsers: true } as any,
                    },
                    mockReq,
                ),
            ).rejects.toThrow('Insufficient permissions: Cannot promote a user to a rank equal or higher than your own');
        });
    });
});
