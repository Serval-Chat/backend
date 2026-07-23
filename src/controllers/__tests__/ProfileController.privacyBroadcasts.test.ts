import { Types } from 'mongoose';
import { ProfileController } from '../ProfileController';

jest.mock('@/models/Bot', () => ({
    Bot: { findOne: jest.fn() },
}));

jest.mock('@/models/UserConnection', () => ({
    UserConnection: { find: jest.fn() },
}));

describe('ProfileController privacy-aware broadcasts', () => {
    const userId = new Types.ObjectId().toHexString();
    const req = {
        user: { id: userId, username: 'alice' },
    } as never;

    const userRepo = {
        update: jest.fn(),
        updateDisplayName: jest.fn(),
        findById: jest.fn(),
        updateCustomStatus: jest.fn(),
        findByUsernames: jest.fn(),
    };
    const serverMemberRepo = {
        findServerIdsByUserId: jest.fn(),
    };
    const friendshipRepo = {
        findAllByUserId: jest.fn(),
        findByUserId: jest.fn(),
    };
    const wsServer = {
        broadcastToServer: jest.fn(),
        broadcastToUser: jest.fn(),
    };
    const blockRepo = {};
    const muteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
    };
    const warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };

    function createController(): ProfileController {
        return new ProfileController(
            userRepo as never,
            { error: jest.fn() } as never,
            serverMemberRepo as never,
            friendshipRepo as never,
            wsServer as never,
            {} as never,
            blockRepo as never,
            {} as never,
            muteRepo as never,
            warningRepo as never,
        );
    }

    beforeEach(() => {
        jest.clearAllMocks();
        muteRepo.checkExpired.mockResolvedValue(undefined);
        muteRepo.findActiveByUserId.mockResolvedValue(null);
        warningRepo.hasUnacknowledged.mockResolvedValue(false);
        friendshipRepo.findAllByUserId.mockResolvedValue([]);
        serverMemberRepo.findServerIdsByUserId.mockResolvedValue(['server-1']);
    });

    describe('updateBio', () => {
        it('does not broadcast to servers when hideBio is set', async () => {
            userRepo.update.mockResolvedValueOnce({
                privacySettings: { hideBio: true },
            });

            await createController().updateBio(req, { bio: 'secret bio' });

            expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
            expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
                userId,
                expect.objectContaining({ type: 'user_updated' }),
            );
        });

        it('broadcasts to servers when hideBio is not set', async () => {
            userRepo.update.mockResolvedValueOnce({
                privacySettings: { hideBio: false },
            });

            await createController().updateBio(req, { bio: 'public bio' });

            expect(wsServer.broadcastToServer).toHaveBeenCalledWith(
                'server-1',
                expect.objectContaining({ type: 'user_updated' }),
            );
        });
    });

    describe('updatePronouns', () => {
        it('does not broadcast to servers when hidePronouns is set', async () => {
            userRepo.update.mockResolvedValueOnce({
                privacySettings: { hidePronouns: true },
            });

            await createController().updatePronouns(req, {
                pronouns: 'they/them',
            });

            expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
        });
    });

    describe('updateDisplayName', () => {
        it('does not broadcast to servers when hideDisplayName is set', async () => {
            userRepo.findById.mockResolvedValueOnce({
                displayName: 'Alice',
                privacySettings: { hideDisplayName: true },
            });

            await createController().updateDisplayName(req, {
                displayName: 'Alice',
            });

            expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
        });
    });

    describe('updateCustomStatus', () => {
        it('does not broadcast to servers when hideStatus is set', async () => {
            userRepo.findById
                .mockResolvedValueOnce({
                    privacySettings: { hideStatus: true },
                })
                .mockResolvedValueOnce({
                    privacySettings: { hideStatus: true },
                    customStatus: { text: 'busy', updatedAt: new Date() },
                });

            await createController().updateCustomStatus(req, {
                text: 'busy',
            });

            expect(wsServer.broadcastToServer).not.toHaveBeenCalled();
        });

        it('broadcasts to servers when hideStatus is not set', async () => {
            userRepo.findById
                .mockResolvedValueOnce({
                    privacySettings: { hideStatus: false },
                })
                .mockResolvedValueOnce({
                    privacySettings: { hideStatus: false },
                    customStatus: { text: 'busy', updatedAt: new Date() },
                });

            await createController().updateCustomStatus(req, {
                text: 'busy',
            });

            expect(wsServer.broadcastToServer).toHaveBeenCalledWith(
                'server-1',
                expect.objectContaining({ type: 'status_update' }),
            );
        });
    });

    describe('getBulkStatuses', () => {
        const otherUserId = new Types.ObjectId().toHexString();

        it('hides status from a non-friend when hideStatus is set', async () => {
            userRepo.findByUsernames.mockResolvedValueOnce([
                {
                    username: 'bob',
                    snowflakeId: otherUserId,
                    customStatus: { text: 'secret status' },
                    privacySettings: { hideStatus: true },
                },
            ]);
            friendshipRepo.findByUserId.mockResolvedValueOnce([]);

            const result = await createController().getBulkStatuses(
                { usernames: ['bob'] },
                req,
            );

            expect(result.statuses.bob).toBeNull();
        });

        it('reveals status to a friend even when hideStatus is set', async () => {
            userRepo.findByUsernames.mockResolvedValueOnce([
                {
                    username: 'bob',
                    snowflakeId: otherUserId,
                    customStatus: {
                        text: 'secret status',
                        updatedAt: new Date(),
                    },
                    privacySettings: { hideStatus: true },
                },
            ]);
            friendshipRepo.findByUserId.mockResolvedValueOnce([
                {
                    userId: { toString: () => userId },
                    friendId: { toString: () => otherUserId },
                },
            ]);

            const result = await createController().getBulkStatuses(
                { usernames: ['bob'] },
                req,
            );

            expect(result.statuses.bob).not.toBeNull();
            expect(result.statuses.bob?.text).toBe('secret status');
        });
    });
});
