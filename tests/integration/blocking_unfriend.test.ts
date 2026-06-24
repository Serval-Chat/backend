import 'reflect-metadata';
import assert from 'assert';
import { container } from '../../src/di/container';
import { TYPES } from '../../src/di/types';
import { BlockController } from '../../src/controllers/BlockController';
import { BlockFlags } from '../../src/privacy/blockFlags';
import { User } from '../../src/models/User';
import type { IUser } from '../../src/models/User';
import type { IBlockRepository } from '../../src/di/interfaces/IBlockRepository';
import type { IFriendshipRepository } from '../../src/di/interfaces/IFriendshipRepository';
import type { AuthenticatedRequest } from '../../src/middleware/auth';
import { setup, teardown } from './setup';
import { clearDatabase } from './helpers';

describe('Blocking Unfriend Integration', () => {
    let blocker: IUser;
    let target: IUser;
    let blockController: BlockController;

    async function createTestUser(username: string) {
        const user = new User({
            login: username,
            username,
            email: `${username}@test.com`,
            password: 'password123',
            isVerified: true,
        });
        return await user.save();
    }

    beforeAll(async () => {
        await setup();
    });

    afterAll(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
        
        blocker = await createTestUser('blocker');
        target = await createTestUser('target');
        
        blockController = new BlockController(
            container.get(TYPES.BlockRepository),
            container.get(TYPES.UserRepository),
            container.get(TYPES.FriendshipRepository)
        );
        
        const blockRepo = container.get<IBlockRepository>(TYPES.BlockRepository);
        await blockRepo.createProfile(blocker.snowflakeId, 'Default', BlockFlags.HIDE_MY_PRESENCE);
    });

    it('should remove friendship when one user blocks another', async () => {
        const friendshipRepo = container.get<IFriendshipRepository>(TYPES.FriendshipRepository);
        await friendshipRepo.create(blocker.snowflakeId, target.snowflakeId);
        
        let areFriends = await friendshipRepo.areFriends(blocker.snowflakeId, target.snowflakeId);
        assert.strictEqual(areFriends, true);

        const profiles = await container.get<IBlockRepository>(TYPES.BlockRepository).findProfilesByOwner(blocker.snowflakeId);
        const req = {
            user: { id: blocker.snowflakeId },
        } as AuthenticatedRequest;
        const profileId = profiles[0]?.snowflakeId;
        assert.ok(profileId !== undefined && profileId !== '', 'Profile ID should exist');
        await blockController.blockUser(req, target.snowflakeId, { profileId });

        // verify they are no longer friends.
        areFriends = await friendshipRepo.areFriends(blocker.snowflakeId, target.snowflakeId);
        assert.strictEqual(areFriends, false, 'Friendship should be removed after blocking');
    });

    it('should remove pending friend requests when one user blocks another', async () => {
        const friendshipRepo = container.get<IFriendshipRepository>(TYPES.FriendshipRepository);
        await friendshipRepo.createRequest(blocker.snowflakeId, target.snowflakeId);
        
        let request = await friendshipRepo.findRequestBetweenUsers(blocker.snowflakeId, target.snowflakeId);
        assert.ok(request, 'Friend request should exist');

        const profiles = await container.get<IBlockRepository>(TYPES.BlockRepository).findProfilesByOwner(blocker.snowflakeId);
        const req = {
            user: { id: blocker.snowflakeId },
        } as AuthenticatedRequest;
        const profileId2 = profiles[0]?.snowflakeId;
        assert.ok(profileId2 !== undefined && profileId2 !== '', 'Profile ID should exist');
        await blockController.blockUser(req, target.snowflakeId, { profileId: profileId2 });

        // verify request is gone.
        request = await friendshipRepo.findRequestBetweenUsers(blocker.snowflakeId, target.snowflakeId);
        assert.strictEqual(request, null, 'Friend request should be removed after blocking');
    });
});
