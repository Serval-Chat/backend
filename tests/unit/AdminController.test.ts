import 'reflect-metadata';
import { Types } from 'mongoose';
import { AdminController } from '../../src/controllers/AdminController';
import { createTestUser, createMockRequest } from '../utils/test-utils';
import { ProfileFieldDTO } from '../../src/controllers/dto/common.request.dto';
import type { AuthenticatedRequest } from '../../src/middleware/auth';
import type { IServerRepository } from '../../src/di/interfaces/IServerRepository';

describe('AdminController', () => {
    let mockUserRepo: Record<string, jest.Mock>;
    let mockAuditLogRepo: Record<string, jest.Mock>;
    let mockFriendshipRepo: Record<string, jest.Mock>;
    let mockWsServer: Record<string, jest.Mock>;
    let mockLogger: Record<string, jest.Mock>;
    let mockBanRepo: Record<string, jest.Mock>;
    let mockServerRepo: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let mockMessageRepo: Record<string, jest.Mock>;
    let mockServerMessageRepo: Record<string, jest.Mock>;
    let mockWarningRepo: Record<string, jest.Mock>;
    let mockServerMemberRepo: Record<string, jest.Mock>;
    let mockChannelRepo: Record<string, jest.Mock>;
    let mockInviteRepo: Record<string, jest.Mock>;
    let mockAdminNoteRepo: Record<string, jest.Mock>;

    let controller: AdminController;
    const getMockServerRepo = (): any => mockServerRepo; // eslint-disable-line @typescript-eslint/no-explicit-any

    beforeEach(() => {
        mockUserRepo = {
            findById: jest.fn(),
            update: jest.fn()
        };
        mockAuditLogRepo = {} as Record<string, jest.Mock>;
        mockFriendshipRepo = {} as Record<string, jest.Mock>;
        mockWsServer = {} as Record<string, jest.Mock>;
        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        };
        mockBanRepo = {} as Record<string, jest.Mock>;
        mockServerRepo = {
            findById: jest.fn(),
            update: jest.fn(),
            findByIds: jest.fn(),
            delete: jest.fn(),
            create: jest.fn(),
        } as unknown as IServerRepository;
        mockMessageRepo = {} as Record<string, jest.Mock>;
        mockServerMessageRepo = {} as Record<string, jest.Mock>;
        mockWarningRepo = {} as Record<string, jest.Mock>;
        mockServerMemberRepo = {
            countByServerId: jest.fn()
        };
        mockChannelRepo = {
            findByServerId: jest.fn()
        };
        mockInviteRepo = {} as Record<string, jest.Mock>;
        mockAdminNoteRepo = {} as Record<string, jest.Mock>;

        controller = new AdminController(
            mockUserRepo as unknown as ConstructorParameters<typeof AdminController>[0],
            mockAuditLogRepo as unknown as ConstructorParameters<typeof AdminController>[1],
            mockFriendshipRepo as unknown as ConstructorParameters<typeof AdminController>[2],
            mockWsServer as unknown as ConstructorParameters<typeof AdminController>[3],
            mockLogger as unknown as ConstructorParameters<typeof AdminController>[4],
            mockBanRepo as unknown as ConstructorParameters<typeof AdminController>[5],
            mockServerRepo as unknown as ConstructorParameters<typeof AdminController>[6],
            mockMessageRepo as unknown as ConstructorParameters<typeof AdminController>[7],
            mockServerMessageRepo as unknown as ConstructorParameters<typeof AdminController>[8],
            mockWarningRepo as unknown as ConstructorParameters<typeof AdminController>[9],
            mockServerMemberRepo as unknown as ConstructorParameters<typeof AdminController>[10],
            mockChannelRepo as unknown as ConstructorParameters<typeof AdminController>[11],
            mockInviteRepo as unknown as ConstructorParameters<typeof AdminController>[12],
            mockAdminNoteRepo as unknown as ConstructorParameters<typeof AdminController>[13]
        );
    });

    it('resetUserProfile resets banner', async () => {
        const userId = new Types.ObjectId().toString();
        const testUser = createTestUser({ _id: new Types.ObjectId(userId), banner: 'old-banner.png' });

        mockUserRepo.findById!.mockResolvedValue(testUser);
        mockUserRepo.update!.mockImplementation(async (id: string | Types.ObjectId, data: Record<string, unknown>) => ({ ...testUser, ...data }));

        const mockReq = createMockRequest({
            user: { id: new Types.ObjectId().toString() }
        }) as unknown as AuthenticatedRequest;

        const result = await controller.resetUserProfile(userId, { fields: [ProfileFieldDTO.BANNER] }, mockReq);

        expect(mockUserRepo.update!).toHaveBeenCalledTimes(1);
        const updateCall = mockUserRepo.update!.mock.calls[0];
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
            adminId: {
                _id: new Types.ObjectId(adminId),
                username: 'admin_user',
                displayName: 'Admin User',
                profilePicture: 'admin_pic.webp'
            },
            content: 'Test note',
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
            deletedBy: null,
            deleteReason: null
        };

        mockAdminNoteRepo.findByTarget = jest.fn().mockResolvedValue([mockNote]);

        const result = await controller.getUserNotes(userId);

        expect(result).toHaveLength(1);
        const note = result[0]!;
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
                ownerId: new Types.ObjectId()
            };

            getMockServerRepo().findById.mockResolvedValue(mockServer);
            getMockServerRepo().update.mockResolvedValue({ ...mockServer, verified: true });
            
            mockAuditLogRepo.create = jest.fn().mockResolvedValue({});

            const mockReq = createMockRequest({
                user: { id: new Types.ObjectId().toString() }
            }) as unknown as AuthenticatedRequest;

            const result = await controller.verifyServer(serverId, mockReq);

            expect(mockServerRepo.findById).toHaveBeenCalledWith(new Types.ObjectId(serverId), true);
            expect(mockServerRepo.update).toHaveBeenCalledWith(new Types.ObjectId(serverId), { verified: true });
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

            getMockServerRepo().findById.mockResolvedValue(mockServer);
            getMockServerRepo().update.mockResolvedValue({ ...mockServer, verified: false });
            mockAuditLogRepo.create = jest.fn().mockResolvedValue({});

            const mockReq = createMockRequest({
                user: { id: new Types.ObjectId().toString() }
            }) as unknown as AuthenticatedRequest;

            const result = await controller.unverifyServer(serverId, mockReq);

            expect(mockServerRepo.findById).toHaveBeenCalledWith(new Types.ObjectId(serverId), true);
            expect(mockServerRepo.update).toHaveBeenCalledWith(new Types.ObjectId(serverId), { verified: false });
            expect(mockAuditLogRepo.create).toHaveBeenCalled();
            expect(mockAuditLogRepo.create.mock.calls[0][0]).toMatchObject({
                actionType: 'unverify_server'
            });
            expect(result).toEqual({ verified: false });
        });
    });
});
