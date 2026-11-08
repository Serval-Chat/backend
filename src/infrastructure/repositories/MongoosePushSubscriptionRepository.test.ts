import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { PushSubscription } from '@/models/PushSubscription';

import { MongoosePushSubscriptionRepository } from './MongoosePushSubscriptionRepository';

let mongod: MongoMemoryServer;
const repo = new MongoosePushSubscriptionRepository();

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await PushSubscription.syncIndexes();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await PushSubscription.deleteMany({});
});

const endpoint = (url: string) => ({
    endpoint: url,
    keys: { p256dh: 'p', auth: 'a' },
});

describe('MongoosePushSubscriptionRepository', () => {
    it('upserts web push subscriptions per endpoint', async () => {
        await repo.upsertWebPush({
            userId: 'u1',
            endpointData: endpoint('https://push/1'),
            vapidKeyVersion: 'v1',
            userAgent: 'old',
        });
        await repo.upsertWebPush({
            userId: 'u1',
            endpointData: endpoint('https://push/1'),
            vapidKeyVersion: 'v2',
            userAgent: 'new',
        });

        const subs = await PushSubscription.find({ userId: 'u1' }).lean();
        expect(subs).toHaveLength(1);
        expect(subs[0]).toMatchObject({
            type: 'webpush',
            vapidKeyVersion: 'v2',
            userAgent: 'new',
        });
    });

    it('replaces other FCM tokens registered for the same device', async () => {
        await repo.upsertFcm({ userId: 'u1', token: 'old', deviceId: 'd1' });
        await repo.upsertFcm({
            userId: 'u1',
            token: 'other-device',
            deviceId: 'd2',
        });
        await repo.upsertFcm({ userId: 'u1', token: 'new', deviceId: 'd1' });

        const tokens = (await PushSubscription.find({ userId: 'u1' }).lean())
            .map((s) => s.fcmToken)
            .sort();
        expect(tokens).toEqual(['new', 'other-device']);
    });

    it('keeps existing tokens when no device id is given', async () => {
        await repo.upsertFcm({ userId: 'u1', token: 't1', deviceId: 'd1' });
        await repo.upsertFcm({ userId: 'u1', token: 't2', deviceId: '  ' });

        const subs = await PushSubscription.find({ userId: 'u1' }).lean();
        expect(subs.map((s) => s.fcmToken).sort()).toEqual(['t1', 't2']);
        expect(subs.find((s) => s.fcmToken === 't2')?.deviceId).toBeUndefined();
    });

    it("deletes one endpoint or all of a user's subscriptions", async () => {
        for (const url of ['https://push/a', 'https://push/b']) {
            await repo.upsertWebPush({
                userId: 'u1',
                endpointData: endpoint(url),
                vapidKeyVersion: 'v1',
            });
        }
        await repo.upsertFcm({ userId: 'u2', token: 'keep' });

        await repo.deleteWebPushByEndpoint('u1', 'https://push/a');
        expect(
            (await PushSubscription.find({ userId: 'u1' }).lean()).map(
                (s) => s.endpointData?.endpoint,
            ),
        ).toEqual(['https://push/b']);

        await repo.deleteAllForUser('u1');
        expect(await PushSubscription.countDocuments({ userId: 'u1' })).toBe(0);
        expect(await PushSubscription.countDocuments({ userId: 'u2' })).toBe(1);
    });
});
