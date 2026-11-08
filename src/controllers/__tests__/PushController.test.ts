import type { Request } from 'express';
import { VAPID_KEY_VERSION } from '@/config/env';
import { PushController } from '../PushController';

const pushSubscriptionRepo = {
    upsertWebPush: jest.fn(),
    upsertFcm: jest.fn(),
    deleteWebPushByEndpoint: jest.fn(),
    deleteAllForUser: jest.fn(),
};
const userRepo = {
    findNotificationPreferences: jest.fn(),
    updateNotificationPreferences: jest.fn(),
};
const req = { headers: { 'user-agent': 'agent' } } as Request;
const subscription = {
    endpoint: 'https://push/new',
    keys: { p256dh: 'p', auth: 'a' },
};

describe('PushController', () => {
    let controller: PushController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new PushController(
            pushSubscriptionRepo,
            userRepo as never,
        );
    });

    it('stores web subscriptions under the current VAPID key version', async () => {
        await controller.subscribeWeb(req, 'u1', { subscription });

        expect(pushSubscriptionRepo.upsertWebPush).toHaveBeenCalledWith({
            userId: 'u1',
            endpointData: subscription,
            vapidKeyVersion: VAPID_KEY_VERSION,
            userAgent: 'agent',
        });
    });

    it('migrates a subscription by removing the old endpoint first', async () => {
        await controller.migrateVapid(req, 'u1', {
            oldEndpoint: 'https://push/old',
            newSubscription: subscription,
        });

        expect(
            pushSubscriptionRepo.deleteWebPushByEndpoint,
        ).toHaveBeenCalledWith('u1', 'https://push/old');
        expect(pushSubscriptionRepo.upsertWebPush).toHaveBeenCalledWith(
            expect.objectContaining({ endpointData: subscription }),
        );
        expect(
            pushSubscriptionRepo.deleteWebPushByEndpoint.mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            pushSubscriptionRepo.upsertWebPush.mock.invocationCallOrder[0] ?? 0,
        );
    });

    it('passes FCM device info through to the repository', async () => {
        await controller.subscribeFcm(req, 'u1', {
            token: 'tok',
            deviceId: 'd1',
        });

        expect(pushSubscriptionRepo.upsertFcm).toHaveBeenCalledWith({
            userId: 'u1',
            token: 'tok',
            deviceId: 'd1',
            userAgent: 'agent',
        });
    });

    it('defaults every preference to on when none are stored', async () => {
        userRepo.findNotificationPreferences.mockResolvedValue(null);

        expect(await controller.getPreferences('u1')).toEqual({
            mention: true,
            friend_request: true,
            custom: true,
        });
    });

    it('returns stored preferences and forwards partial updates', async () => {
        const stored = { mention: false, friend_request: true, custom: false };
        userRepo.findNotificationPreferences.mockResolvedValue(stored);

        expect(await controller.getPreferences('u1')).toBe(stored);

        await controller.updatePreferences('u1', { mention: true });
        expect(userRepo.updateNotificationPreferences).toHaveBeenCalledWith(
            'u1',
            { mention: true },
        );
    });
});
