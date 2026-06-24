/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';
import { Types } from 'mongoose';
import { AdminController } from '../../src/controllers/AdminController';
import { createTestUser, createMockRequest } from '../utils/test-utils';
import { ProfileFieldDTO } from '../../src/controllers/dto/common.request.dto';
import type { AuthenticatedRequest } from '../../src/middleware/auth';


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
            update: jest.fn(),
            updatePermissions: jest.fn(),
        };
        mockAuditLogRepo = {
            create: jest.fn(),
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
        mockWarningRepo = {} as Record<string, jest.Mock>;
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
