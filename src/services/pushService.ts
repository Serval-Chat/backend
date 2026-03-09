import webpush from 'web-push';
import { PushSubscription } from '../models/PushSubscription';
import { User } from '../models/User';
import logger from '../utils/logger';
import { VAPID_PUB, VAPID_PRI } from '../config/env';
import { parseNotificationText } from '../utils/textParser';

const vapidConfigs: Record<string, { publicKey: string; privateKey: string }> = {};

export function initWebPush() {
    if (process.env.VAPID_KEY_VERSION && VAPID_PUB && VAPID_PRI) {
        vapidConfigs[process.env.VAPID_KEY_VERSION] = {
            publicKey: VAPID_PUB,
            privateKey: VAPID_PRI,
        };
    }
}

let _fcmAdmin: any = null;
async function getFCM() {
    if (_fcmAdmin) return _fcmAdmin;
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) return null;

    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(
                JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            ),
        });
    }
    _fcmAdmin = admin;
    return _fcmAdmin;
}

type NotificationType = 'mention' | 'friend_request' | 'dm' | 'custom';

interface NotificationPayload {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    url?: string;
    data?: Record<string, string>;
}

const templates: Record<NotificationType, (d: any) => NotificationPayload> = {
    mention: ({ senderName, channelName, preview }) => ({
        title: `${senderName} mentioned you`,
        body: channelName ? `#${channelName}: ${preview}` : preview,
        tag: 'mention',
        data: { type: 'mention' },
    }),
    friend_request: ({ senderName, senderId }) => ({
        title: 'New friend request',
        body: `${senderName} wants to connect`,
        tag: 'friend_request',
        data: { type: 'friend_request', senderId },
    }),
    dm: ({ senderName, senderId, preview }) => ({
        title: senderName,
        body: preview,
        tag: `dm_${senderId}`,
        data: { type: 'dm', senderId },
    }),
    custom: ({ title, body, url, tag }) => ({
        title, body, tag: tag ?? 'custom',
        data: { type: 'custom', url: url ?? '/' },
    }),
};

async function sendToSubscription(sub: any, payload: NotificationPayload) {
    if (sub.type === 'webpush') {
        const version = sub.vapidKeyVersion ?? 'v1';
        const config = vapidConfigs[version];

        if (!config) {
            logger.warn(`[PushService] Key version ${version} no longer loaded — removing subscription ${sub._id}`);
            await PushSubscription.deleteOne({ _id: sub._id });
            return;
        }

        try {
            logger.debug(`[PushService] Sending Web Push to ${sub.userId} (version ${version})`);
            await webpush.sendNotification(
                sub.endpointData,
                JSON.stringify(payload),
                {
                    TTL: 86400, // 24h
                    vapidDetails: {
                        subject: `mailto:${process.env.VAPID_EMAIL || 'admin@localhost'}`,
                        publicKey: config.publicKey,
                        privateKey: config.privateKey,
                    },
                }
            );
        } catch (err: any) {
            if (err.statusCode === 401) {
                logger.warn(`[PushService] Webpush error 401 (Key mismatch) for sub ${sub._id}. Removing.`);
                await PushSubscription.deleteOne({ _id: sub._id });
            } else if (err.statusCode === 410 || err.statusCode === 404) {
                logger.info(`[PushService] Webpush error ${err.statusCode} (Expired/Unsubscribed) for sub ${sub._id}. Removing.`);
                await PushSubscription.deleteOne({ _id: sub._id });
            } else {
                logger.error(`[PushService] Unhandled Webpush error for ${sub.userId}:`, err);
            }
        }
    } else {
        const admin = await getFCM();
        if (!admin) {
            logger.debug(`[PushService] FCM skipped (no credentials) for sub ${sub._id}`);
            return;
        }
        try {
            logger.debug(`[PushService] Sending FCM to ${sub.userId}`);
            await admin.messaging().send({
                token: sub.fcmToken,
                notification: { title: payload.title, body: payload.body },
                data: payload.data ?? {},
                android: { priority: 'high', notification: { tag: payload.tag } },
            });
        } catch (err: any) {
            const expired = [
                'messaging/registration-token-not-registered',
                'messaging/invalid-registration-token',
            ];
            if (expired.includes(err.code)) {
                logger.info(`[PushService] FCM token expired for sub ${sub._id}. Removing.`);
                await PushSubscription.deleteOne({ _id: sub._id });
            } else {
                logger.error(`[PushService] FCM error for ${sub.userId}:`, err);
            }
        }
    }
}

const _onlineUsers = new Map<string, number>();

export function connectUser(userId: string) {
    const newCount = (_onlineUsers.get(userId) ?? 0) + 1;
    _onlineUsers.set(userId, newCount);
    logger.debug(`[PushService] User ${userId} connected. Open sockets: ${newCount}`);
}

export function disconnectUser(userId: string) {
    const count = (_onlineUsers.get(userId) ?? 1) - 1;
    if (count <= 0) {
        _onlineUsers.delete(userId);
        logger.debug(`[PushService] User ${userId} fully disconnected.`);
    } else {
        _onlineUsers.set(userId, count);
        logger.debug(`[PushService] User ${userId} socket closed. Remaining sockets: ${count}`);
    }
}

function isUserOnline(userId: string): boolean {
    const isOnline = (_onlineUsers.get(userId) ?? 0) > 0;
    return isOnline;
}

async function isAllowedByPreferences(
    userId: string,
    type: NotificationType
): Promise<boolean> {
    const user = await User.findById(userId).select('notificationPreferences').lean();
    if (!user?.notificationPreferences) return true;
    const prefs = user.notificationPreferences as Record<string, boolean>;
    return prefs[type] !== false;
}

export async function notifyUser(
    userId: string,
    type: NotificationType,
    data: object
) {
    logger.info(`[PushService] Analyzing push triggers for user ${userId} (Type: ${type})`);

    if (isUserOnline(userId)) {
        logger.info(`[PushService] Skipped push: User ${userId} is currently online via WebSocket.`);
        return;
    }

    if (!(await isAllowedByPreferences(userId, type))) {
        logger.info(`[PushService] Skipped push: User ${userId} disabled ${type} notifications.`);
        return;
    }

    if ('preview' in data && typeof data.preview === 'string') {
        data.preview = await parseNotificationText(data.preview);
    }
    if ('body' in data && typeof data.body === 'string') {
        data.body = await parseNotificationText(data.body);
    }

    const payload = templates[type](data);
    const subs = await PushSubscription.find({ userId });

    logger.info(`[PushService] Found ${subs.length} push subscriptions for user ${userId}`);

    if (subs.length === 0) return;

    await Promise.allSettled(subs.map((s) => sendToSubscription(s, payload)));
}

export async function notifyUsers(
    userIds: string[],
    type: NotificationType,
    data: object
) {
    await Promise.allSettled(userIds.map((id) => notifyUser(id, type, data)));
}
