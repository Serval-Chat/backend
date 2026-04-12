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
import type { Request } from 'express';
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
        await blockRepo.createProfile(blocker._id, 'Default', BlockFlags.HIDE_MY_PRESENCE);
    });

    it('should remove friendship when one user blocks another', async () => {
        const friendshipRepo = container.get<IFriendshipRepository>(TYPES.FriendshipRepository);
        await friendshipRepo.create(blocker._id, target._id);
        
        let areFriends = await friendshipRepo.areFriends(blocker._id, target._id);
        assert.strictEqual(areFriends, true);

        const profiles = await container.get<IBlockRepository>(TYPES.BlockRepository).findProfilesByOwner(blocker._id);
        const req = { user: { id: blocker._id.toString() } } as unknown as Request;
        await blockController.blockUser(req, target._id.toString(), { profileId: profiles[0]!._id.toString() });

        // verify they are no longer friends.
        areFriends = await friendshipRepo.areFriends(blocker._id, target._id);
        assert.strictEqual(areFriends, false, 'Friendship should be removed after blocking');
    });

    it('should remove pending friend requests when one user blocks another', async () => {
        const friendshipRepo = container.get<IFriendshipRepository>(TYPES.FriendshipRepository);
        await friendshipRepo.createRequest(blocker._id, target._id);
        
        let request = await friendshipRepo.findRequestBetweenUsers(blocker._id, target._id);
        assert.ok(request, 'Friend request should exist');

        const profiles = await container.get<IBlockRepository>(TYPES.BlockRepository).findProfilesByOwner(blocker._id);
        const req = { user: { id: blocker._id.toString() } } as unknown as Request;
        await blockController.blockUser(req, target._id.toString(), { profileId: profiles[0]!._id.toString() });

        // verify request is gone.
        request = await friendshipRepo.findRequestBetweenUsers(blocker._id, target._id);
        assert.strictEqual(request, null, 'Friend request should be removed after blocking');
    });
});
