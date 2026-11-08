/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminBadgeController } from '../AdminBadgeController';

describe('AdminBadgeController', () => {
    let controller: AdminBadgeController;
    const mockUserRepo = {
        findById: jest.fn(),
        update: jest.fn(),
        removeBadgeFromAllUsers: jest.fn(),
    };
    const mockBadgeRepo = {
        findAll: jest.fn(),
        findByIdOrSnowflake: jest.fn(),
        findByIdsOrSnowflakes: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteByIdOrSnowflake: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockBadgeRepo.findByIdOrSnowflake.mockResolvedValue(null);
        controller = new AdminBadgeController(
            mockUserRepo as any,
            mockBadgeRepo,
        );
    });

    describe('getBadges', () => {
        it('returns all badges sorted by createdAt', async () => {
            const mockBadges = [{ id: 'b1', name: 'Badge 1' }];
            mockBadgeRepo.findAll.mockResolvedValue(mockBadges);

            const result = await controller.getBadges();
            expect(result).toEqual(mockBadges);
        });
    });

    describe('createBadge', () => {
        it('throws ConflictException if badge ID exists', async () => {
            mockBadgeRepo.findByIdOrSnowflake.mockResolvedValue({
                id: 'existing',
            });
            await expect(
                controller.createBadge({
                    id: 'existing',
                    name: 'N',
                    description: 'D',
                    icon: 'bug',
                }),
            ).rejects.toThrow(ConflictException);
        });

        it('creates and returns a new badge', async () => {
            mockBadgeRepo.create.mockResolvedValue({ id: 'new' });

            const result = await controller.createBadge({
                id: 'new',
                name: 'N',
                description: 'D',
                icon: 'bug',
            });
            expect(result).toEqual({ id: 'new' });
            expect(mockBadgeRepo.create).toHaveBeenCalledWith({
                id: 'new',
                name: 'N',
                description: 'D',
                icon: 'bug',
                color: '#3b82f6',
            });
        });
    });

    describe('updateBadge', () => {
        it('throws NotFoundException if badge not found', async () => {
            mockBadgeRepo.update.mockResolvedValue(null);
            await expect(
                controller.updateBadge('missing', { name: 'New' }),
            ).rejects.toThrow(NotFoundException);
        });

        it('updates and returns the badge', async () => {
            mockBadgeRepo.update.mockResolvedValue({ id: 'b1', name: 'New' });

            const result = await controller.updateBadge('b1', { name: 'New' });
            expect(result.name).toBe('New');
            expect(mockBadgeRepo.update).toHaveBeenCalledWith('b1', {
                name: 'New',
            });
        });
    });

    describe('deleteBadge', () => {
        it('throws NotFoundException if badge not found', async () => {
            await expect(controller.deleteBadge('missing')).rejects.toThrow(
                NotFoundException,
            );
            expect(mockBadgeRepo.deleteByIdOrSnowflake).not.toHaveBeenCalled();
        });

        it('deletes badge and removes it from all users', async () => {
            mockBadgeRepo.findByIdOrSnowflake.mockResolvedValue({ id: 'b1' });

            const result = await controller.deleteBadge('b1');
            expect(result.message).toContain('successfully');
            expect(mockBadgeRepo.deleteByIdOrSnowflake).toHaveBeenCalledWith(
                'b1',
            );
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
            mockBadgeRepo.findByIdsOrSnowflakes.mockResolvedValue([
                { id: 'b1' },
            ]);

            const result = await controller.getUserBadges(userId.toHexString());
            expect(result).toEqual([{ id: 'b1' }]);
            expect(mockBadgeRepo.findByIdsOrSnowflakes).toHaveBeenCalledWith([
                'b1',
            ]);
        });
    });

    describe('addBadgeToUser', () => {
        it('throws ConflictException if user already has badge', async () => {
            const userId = new Types.ObjectId();
            mockUserRepo.findById.mockResolvedValue({
                _id: userId,
                badges: ['b1'],
            });
            mockBadgeRepo.findByIdOrSnowflake.mockResolvedValue({ id: 'b1' });

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
            mockBadgeRepo.findByIdOrSnowflake.mockResolvedValue({ id: 'b1' });

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
