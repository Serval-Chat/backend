jest.mock('dotenv', () => {
    const real = jest.requireActual('dotenv');
    const config = (...args: unknown[]) => {
        const result = real.config(...args);
        delete process.env.VAPID_KEY_VERSION;
        delete process.env.VAPID_EMAIL;
        return result;
    };
    return { __esModule: true, default: { ...real, config }, config };
});
jest.mock('web-push', () => ({
    __esModule: true,
    default: { sendNotification: jest.fn().mockResolvedValue({}) },
}));
jest.mock('@/models/PushSubscription', () => ({
    PushSubscription: { find: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock('@/models/User', () => ({
    User: {
        findOne: () => ({ select: () => ({ lean: async () => null }) }),
    },
}));
jest.mock('@/utils/textParser', () => ({
    parseNotificationText: async (text: string) => text,
}));
jest.mock('@/di/container', () => ({
    container: { get: () => ({ getClient: () => ({ scard: async () => 0 }) }) },
}));

type PushModules = {
    env: typeof import('@/config/env');
    push: typeof import('@/services/PushService');
    webpush: { sendNotification: jest.Mock };
    PushSubscription: { find: jest.Mock; deleteOne: jest.Mock };
};

function loadWithEnv(vars: Record<string, string | undefined>): PushModules {
    for (const [key, value] of Object.entries(vars)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    let mods!: PushModules;
    jest.isolateModules(() => {
        mods = {
            env: require('@/config/env'),
            push: require('@/services/PushService'),
            webpush: require('web-push').default,
            PushSubscription: require('@/models/PushSubscription')
                .PushSubscription,
        };
    });
    return mods;
}

describe('PushService VAPID key version', () => {
    const saved = { ...process.env };
    afterEach(() => {
        process.env = { ...saved };
    });

    it('delivers to a subscription saved under the default version when VAPID_KEY_VERSION is unset', async () => {
        const { env, push, webpush, PushSubscription } = loadWithEnv({
            VAPID_PUBLIC_KEY: 'pub',
            VAPID_PRIVATE_KEY: 'priv',
        });
        push.initWebPush();

        PushSubscription.find.mockResolvedValueOnce([
            {
                _id: 'sub1',
                userId: 'u1',
                type: 'webpush',
                vapidKeyVersion: env.VAPID_KEY_VERSION,
                endpointData: { endpoint: 'https://push.example/1' },
                createdAt: new Date(),
            },
        ]);

        await push.notifyUser('u1', 'custom', {
            type: 'custom',
            title: 't',
            body: 'b',
        });

        expect(PushSubscription.deleteOne).not.toHaveBeenCalled();
        expect(webpush.sendNotification).toHaveBeenCalledWith(
            { endpoint: 'https://push.example/1' },
            expect.any(String),
            expect.objectContaining({
                vapidDetails: {
                    subject: 'mailto:admin@localhost',
                    publicKey: 'pub',
                    privateKey: 'priv',
                },
            }),
        );
    });
});
