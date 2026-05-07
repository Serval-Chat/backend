import { NotFoundException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import { AdminBadgeController } from '../AdminBadgeController';
import { Badge } from '@/models/Badge';

jest.mock('@/models/Badge', () => ({
    Badge: jest.fn().mockImplementation(() => ({
        save: jest.fn(),
        toObject: jest.fn(),
    })),
}));

// Add static methods to mocked Badge
(Badge as unknown as { find: jest.Mock }).find = jest.fn();
(Badge as unknown as { findOne: jest.Mock }).findOne = jest.fn();
(Badge as unknown as { deleteOne: jest.Mock }).deleteOne = jest.fn();

function makeChain(value: unknown) {
    return {
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(value),
    };
}

describe('AdminBadgeController', () => {
    let controller: AdminBadgeController;
    const mockUserRepo = {
        findById: jest.fn(),
        update: jest.fn(),
        removeBadgeFromAllUsers: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new AdminBadgeController(
            mockUserRepo as unknown as IUserRepository,
        );
    });

    describe('getBadges', () => {
        it('returns all badges sorted by createdAt', async () => {
            const mockBadges = [{ id: 'b1', name: 'Badge 1' }];
            (Badge.find as jest.Mock).mockReturnValue(makeChain(mockBadges));

            const result = await controller.getBadges();
            expect(result).toEqual(mockBadges);
            expect(Badge.find).toHaveBeenCalled();
        });
    });

    describe('createBadge', () => {
        it('throws ConflictException if badge ID exists', async () => {
            (Badge.findOne as jest.Mock).mockResolvedValue({ id: 'existing' });
            await expect(
                controller.createBadge({
                    id: 'existing',
                    name: 'N',
                    description: 'D',
                    icon: 'I',
                }),
            ).rejects.toThrow(ConflictException);
        });

        it('creates and returns a new badge', async () => {
            (Badge.findOne as jest.Mock).mockResolvedValue(null);
            const mockBadgeInstance = {
                save: jest.fn().mockResolvedValue(true),
                toObject: jest.fn().mockReturnValue({ id: 'new' }),
            };
            (Badge as unknown as jest.Mock).mockImplementation(
                () => mockBadgeInstance,
            );

            const result = await controller.createBadge({
                id: 'new',
                name: 'N',
                description: 'D',
                icon: 'I',
            });
            expect(result).toEqual({ id: 'new' });
            expect(mockBadgeInstance.save).toHaveBeenCalled();
        });
    });

    describe('updateBadge', () => {
        it('throws NotFoundException if badge not found', async () => {
            (Badge.findOne as jest.Mock).mockResolvedValue(null);
            await expect(
                controller.updateBadge('missing', { name: 'New' }),
            ).rejects.toThrow(NotFoundException);
        });

        it('updates and returns the badge', async () => {
            const mockBadgeInstance = {
                id: 'b1',
                name: 'Old',
                save: jest.fn().mockResolvedValue(true),
                toObject: jest.fn().mockReturnValue({ id: 'b1', name: 'New' }),
            };
            (Badge.findOne as jest.Mock).mockResolvedValue(mockBadgeInstance);

            const result = await controller.updateBadge('b1', { name: 'New' });
            expect(result.name).toBe('New');
            expect(mockBadgeInstance.name).toBe('New');
            expect(mockBadgeInstance.save).toHaveBeenCalled();
        });
    });

    describe('deleteBadge', () => {
        it('throws NotFoundException if badge not found', async () => {
            (Badge.findOne as jest.Mock).mockResolvedValue(null);
            await expect(controller.deleteBadge('missing')).rejects.toThrow(
                NotFoundException,
            );
        });

        it('deletes badge and removes it from all users', async () => {
            (Badge.findOne as jest.Mock).mockResolvedValue({ id: 'b1' });
            (Badge.deleteOne as jest.Mock).mockResolvedValue({
                deletedCount: 1,
            });

            const result = await controller.deleteBadge('b1');
            expect(result.message).toContain('successfully');
            expect(Badge.deleteOne).toHaveBeenCalledWith({ id: 'b1' });
            expect(mockUserRepo.removeBadgeFromAllUsers).toHaveBeenCalledWith(
                'b1',
            );
        });
    });

    describe('getUserBadges', () => {
        it('throws NotFoundException if user not found', async () => {
            mockUserRepo.findById.mockResolvedValue(null);
            await expect(
                controller.getUserBadges(new Types.ObjectId().toHexString()),
            ).rejects.toThrow(NotFoundException);
        });

        it('returns user badges', async () => {
            const userId = new Types.ObjectId();
            mockUserRepo.findById.mockResolvedValue({
                _id: userId,
                badges: ['b1'],
            });
            (Badge.find as jest.Mock).mockReturnValue({
                lean: jest.fn().mockResolvedValue([{ id: 'b1' }]),
            });

            const result = await controller.getUserBadges(userId.toHexString());
            expect(result).toEqual([{ id: 'b1' }]);
        });
    });

    describe('addBadgeToUser', () => {
        it('throws ConflictException if user already has badge', async () => {
            const userId = new Types.ObjectId();
            mockUserRepo.findById.mockResolvedValue({
                _id: userId,
                badges: ['b1'],
            });
            (Badge.findOne as jest.Mock).mockResolvedValue({ id: 'b1' });

            await expect(
                controller.addBadgeToUser(userId.toHexString(), 'b1'),
            ).rejects.toThrow(ConflictException);
        });

        it('adds badge to user', async () => {
            const userId = new Types.ObjectId();
            mockUserRepo.findById.mockResolvedValue({
                _id: userId,
                badges: [],
            });
            (Badge.findOne as jest.Mock).mockResolvedValue({ id: 'b1' });

            const result = await controller.addBadgeToUser(
                userId.toHexString(),
                'b1',
            );
            expect(result.badges).toContain('b1');
            expect(mockUserRepo.update).toHaveBeenCalled();
        });
    });

    describe('removeBadgeFromUser', () => {
        it('throws NotFoundException if user does not have badge', async () => {
            const userId = new Types.ObjectId();
            mockUserRepo.findById.mockResolvedValue({
                _id: userId,
                badges: [],
            });

            await expect(
                controller.removeBadgeFromUser(userId.toHexString(), 'b1'),
            ).rejects.toThrow(NotFoundException);
        });

        it('removes badge from user', async () => {
            const userId = new Types.ObjectId();
            mockUserRepo.findById.mockResolvedValue({
                _id: userId,
                badges: ['b1'],
            });

            const result = await controller.removeBadgeFromUser(
                userId.toHexString(),
                'b1',
            );
            expect(result.badges).not.toContain('b1');
            expect(mockUserRepo.update).toHaveBeenCalled();
        });
    });
});
