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

    let controller: AdminController;

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
        mockServerRepo = {} as Record<string, jest.Mock>;
        mockMessageRepo = {} as Record<string, jest.Mock>;
        mockServerMessageRepo = {} as Record<string, jest.Mock>;
        mockWarningRepo = {} as Record<string, jest.Mock>;
        mockServerMemberRepo = {} as Record<string, jest.Mock>;

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
            mockServerMemberRepo as unknown as ConstructorParameters<typeof AdminController>[10]
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
});
