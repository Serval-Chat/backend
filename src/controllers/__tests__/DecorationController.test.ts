/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { DecorationController } from '../DecorationController';
import { ApiError } from '@/utils/ApiError';
import { Decoration } from '@/models/Decoration';
import { User } from '@/models/User';

const OWNER_ID = 'user_owner';
const OTHER_ID = 'user_other';
const DECO_ID = '012345678901234567';

const makeDecoration = (overrides: Partial<Record<string, unknown>> = {}) => ({
    _id: 'mongo_id',
    snowflakeId: DECO_ID,
    name: 'Test Deco',
    filename: 'abc123.webp',
    createdBy: OWNER_ID,
    createdAt: new Date('2024-01-01'),
    ...overrides,
});

const mockFindOne = (returnValue: unknown) =>
    jest.spyOn(Decoration, 'findOne').mockReturnValue({
        exec: jest.fn().mockResolvedValue(returnValue),
    } as any);

const mockFind = (returnValue: unknown[]) =>
    jest.spyOn(Decoration, 'find').mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(returnValue),
    } as any);

const mockDeleteOne = () =>
    jest
        .spyOn(Decoration, 'deleteOne')
        .mockResolvedValue({ deletedCount: 1 } as any);

const mockUserFind = (returnValue: unknown[]) =>
    jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(returnValue),
    } as any);

const mockUserUpdateMany = () =>
    jest
        .spyOn(User, 'updateMany')
        .mockResolvedValue({ modifiedCount: 1 } as any);

const mockUserRepo = {
    update: jest.fn(),
    findById: jest.fn(),
    updateDecoration: jest.fn(),
};

const mockWsServer = {
    broadcastToServer: jest.fn(),
    broadcastToUser: jest.fn(),
};

const mockServerMemberRepo = {
    findServerIdsByUserId: jest.fn().mockResolvedValue([]),
};

const mockFriendshipRepo = {
    findAllByUserId: jest.fn().mockResolvedValue([]),
};

describe('DecorationController', () => {
    let controller: DecorationController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new DecorationController(
            mockUserRepo as any,
            mockWsServer as any,
            mockServerMemberRepo as any,
            mockFriendshipRepo as any,
        );
    });

    describe('uploadDecoration', () => {
        it('should throw BadRequestException when no file is provided', async () => {
            await expect(
                controller.uploadDecoration(
                    undefined,
                    { name: 'Test' },
                    OWNER_ID,
                ),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('applyDecoration', () => {
        it('should throw 404 ApiError when decoration does not exist', async () => {
            mockFindOne(null);

            const error = await controller
                .applyDecoration('nonexistent', OWNER_ID)
                .catch((e) => e);

            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(404);
        });

        it('should update user decoration and broadcast when decoration exists', async () => {
            mockFindOne(makeDecoration());
            mockUserRepo.updateDecoration.mockResolvedValue(undefined);

            const result = await controller.applyDecoration(DECO_ID, OWNER_ID);

            expect(mockUserRepo.updateDecoration).toHaveBeenCalledWith(
                OWNER_ID,
                DECO_ID,
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
                OWNER_ID,
                expect.objectContaining({ type: 'user_updated' }),
            );
            expect(result.message).toBe('Decoration applied successfully');
        });
    });

    describe('removeActiveDecoration', () => {
        it('should clear decoration and broadcast to the user', async () => {
            mockUserRepo.updateDecoration.mockResolvedValue(undefined);

            const result = await controller.removeActiveDecoration(OWNER_ID);

            expect(mockUserRepo.updateDecoration).toHaveBeenCalledWith(
                OWNER_ID,
                null,
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
                OWNER_ID,
                expect.objectContaining({
                    type: 'user_updated',
                    payload: { userId: OWNER_ID, decorationId: null },
                }),
            );
            expect(result.message).toBe('Decoration removed successfully');
        });
    });

    describe('getMyDecorations', () => {
        it('should return an empty list when user has no decorations', async () => {
            mockFind([]);

            const result = await controller.getMyDecorations(OWNER_ID);

            expect(result.decorations).toHaveLength(0);
        });

        it('should return decorations owned by the current user', async () => {
            const deco = makeDecoration();
            mockFind([deco]);

            const result = await controller.getMyDecorations(OWNER_ID);

            expect(result.decorations).toHaveLength(1);
            expect(result.decorations[0]).toMatchObject({
                id: deco.snowflakeId,
                name: deco.name,
                filename: deco.filename,
                createdBy: deco.createdBy,
            });
        });

        it('should return multiple decorations sorted by recency', async () => {
            const decos = [
                makeDecoration({ snowflakeId: 'id_1', name: 'Newer' }),
                makeDecoration({ snowflakeId: 'id_2', name: 'Older' }),
            ];
            mockFind(decos);

            const result = await controller.getMyDecorations(OWNER_ID);

            expect(result.decorations).toHaveLength(2);
            expect(result.decorations[0]?.name).toBe('Newer');
        });
    });

    describe('deleteDecoration', () => {
        it('should throw 404 ApiError when decoration does not exist', async () => {
            mockFindOne(null);

            const error = await controller
                .deleteDecoration('nonexistent', OWNER_ID)
                .catch((e) => e);

            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(404);
        });

        it('should throw 403 ApiError when requester is not the owner', async () => {
            mockFindOne(makeDecoration({ createdBy: OWNER_ID }));

            const error = await controller
                .deleteDecoration(DECO_ID, OTHER_ID)
                .catch((e) => e);

            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(403);
        });

        it('should delete document and broadcast to users currently wearing it', async () => {
            const deco = makeDecoration();
            mockFindOne(deco);
            mockDeleteOne();
            mockUserFind([{ snowflakeId: 'affected_user' }]);
            mockUserUpdateMany();

            const result = await controller.deleteDecoration(DECO_ID, OWNER_ID);

            expect(Decoration.deleteOne).toHaveBeenCalledWith({
                _id: deco._id,
            });
            expect(User.updateMany).toHaveBeenCalledWith(
                { decorationId: DECO_ID },
                { $unset: { decorationId: '' } },
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
                'affected_user',
                expect.objectContaining({
                    type: 'user_updated',
                    payload: { userId: 'affected_user', decorationId: null },
                }),
            );
            expect(result.message).toBe('Decoration deleted successfully');
        });

        it('should skip User.updateMany when no users are wearing the decoration', async () => {
            mockFindOne(makeDecoration());
            mockDeleteOne();
            mockUserFind([]);
            const updateManySpy = mockUserUpdateMany();

            await controller.deleteDecoration(DECO_ID, OWNER_ID);

            expect(updateManySpy).not.toHaveBeenCalled();
        });
    });

    describe('getDecoration', () => {
        it('should throw 404 ApiError when decoration does not exist', async () => {
            mockFindOne(null);

            const error = await controller
                .getDecoration('nonexistent')
                .catch((e) => e);

            expect(error).toBeInstanceOf(ApiError);
            expect((error as ApiError).status).toBe(404);
        });

        it('should return decoration metadata when it exists', async () => {
            const deco = makeDecoration();
            mockFindOne(deco);

            const result = await controller.getDecoration(DECO_ID);

            expect(result).toMatchObject({
                id: deco.snowflakeId,
                name: deco.name,
                filename: deco.filename,
                createdBy: deco.createdBy,
            });
            expect(result.createdAt).toEqual(deco.createdAt);
        });
    });

    describe('broadcastUserUpdate (via applyDecoration)', () => {
        it('should broadcast to all servers the user is a member of', async () => {
            mockFindOne(makeDecoration());
            mockServerMemberRepo.findServerIdsByUserId.mockResolvedValue([
                'server_1',
                'server_2',
            ]);
            mockFriendshipRepo.findAllByUserId.mockResolvedValue([]);
            mockUserRepo.updateDecoration.mockResolvedValue(undefined);

            await controller.applyDecoration(DECO_ID, OWNER_ID);

            expect(mockWsServer.broadcastToServer).toHaveBeenCalledTimes(2);
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                'server_1',
                expect.objectContaining({ type: 'user_updated' }),
            );
            expect(mockWsServer.broadcastToServer).toHaveBeenCalledWith(
                'server_2',
                expect.objectContaining({ type: 'user_updated' }),
            );
        });

        it('should broadcast to friends (resolving the correct friend ID)', async () => {
            mockFindOne(makeDecoration());
            mockServerMemberRepo.findServerIdsByUserId.mockResolvedValue([]);
            mockFriendshipRepo.findAllByUserId.mockResolvedValue([
                { userId: OWNER_ID, friendId: 'friend_A' },
                { userId: 'friend_B', friendId: OWNER_ID },
            ]);
            mockUserRepo.updateDecoration.mockResolvedValue(undefined);

            await controller.applyDecoration(DECO_ID, OWNER_ID);

            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
                'friend_A',
                expect.objectContaining({ type: 'user_updated' }),
            );
            expect(mockWsServer.broadcastToUser).toHaveBeenCalledWith(
                'friend_B',
                expect.objectContaining({ type: 'user_updated' }),
            );
        });
    });
});
