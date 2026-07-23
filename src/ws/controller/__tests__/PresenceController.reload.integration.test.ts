import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { User } from '@/models/User';
import { MongooseUserRepository } from '@/infrastructure/repositories/MongooseUserRepository';
import { PresenceController } from '../PresenceController';

let mongod: MongoMemoryServer;
let userRepo: MongooseUserRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    userRepo = new MongooseUserRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

const createUser = (overrides: Record<string, unknown> = {}) =>
    User.create({
        username: `user_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        login: `login_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`,
        password: 'password123',
        ...overrides,
    });

describe('PresenceController + real repository: reload persistence', () => {
    const friendshipRepo = { findByUserId: jest.fn().mockResolvedValue([]) };
    const serverMemberRepo = {
        findServerIdsByUserId: jest.fn().mockResolvedValue([]),
        findUserIdsInServerIds: jest.fn().mockResolvedValue([]),
    };
    const blockRepo = {
        findBlocksByBlocker: jest.fn().mockResolvedValue([]),
        findBlocksByTarget: jest.fn().mockResolvedValue([]),
    };
    const muteRepo = {
        checkExpired: jest.fn().mockResolvedValue(undefined),
        findActiveByUserId: jest.fn().mockResolvedValue(null),
    };
    const warningRepo = {
        hasUnacknowledged: jest.fn().mockResolvedValue(false),
    };
    const wsServer = {
        isUserOnline: jest.fn().mockResolvedValue(false),
        broadcastToUser: jest.fn(),
        broadcastToPresenceAudience: jest.fn(),
    };

    function createController(): PresenceController {
        const controller = new PresenceController(
            userRepo,
            friendshipRepo as never,
            serverMemberRepo as never,
            blockRepo as never,
            muteRepo as never,
            warningRepo as never,
        );
        (controller as unknown as { wsServer: typeof wsServer }).wsServer =
            wsServer;
        return controller;
    }

    it('keeps a manually-set offline status intact across a disconnect + reconnect (page reload)', async () => {
        const user = await createUser({ presenceStatus: 'offline' });

        const controller = createController();

        await controller.broadcastUserOffline(user.snowflakeId, user.username);
        await controller.sendPresenceSync({
            userId: user.snowflakeId,
            username: user.username,
        } as never);
        await controller.broadcastUserOnline(user.snowflakeId, user.username);

        const reloaded = await userRepo.findById(user.snowflakeId);
        expect(reloaded?.presenceStatus).toBe('offline');
    });

    it('keeps a manually-set dnd status intact across a disconnect + reconnect (page reload)', async () => {
        const user = await createUser({ presenceStatus: 'dnd' });

        const controller = createController();

        await controller.broadcastUserOffline(user.snowflakeId, user.username);
        await controller.sendPresenceSync({
            userId: user.snowflakeId,
            username: user.username,
        } as never);
        await controller.broadcastUserOnline(user.snowflakeId, user.username);

        const reloaded = await userRepo.findById(user.snowflakeId);
        expect(reloaded?.presenceStatus).toBe('dnd');
    });
});
