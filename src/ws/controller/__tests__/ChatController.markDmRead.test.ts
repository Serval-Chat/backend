/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatController } from '../ChatController';
import type { IWsUser } from '@/ws/types';

jest.mock('@/services/PushService', () => ({
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
}));

const USER_ID = '0254710804526399488';
const PEER_ID = '0254710804526399489';

const user: IWsUser = {
    userId: USER_ID,
    username: 'caller',
    isBot: false,
} as IWsUser;

describe('mark_dm_read requires a real conversation', () => {
    let redis: { get: jest.Mock; setex: jest.Mock };
    let messageRepo: { conversationExists: jest.Mock };
    let dmUnreadRepo: { reset: jest.Mock };
    let userRepo: { findById: jest.Mock };
    let wsServer: { broadcastToUser: jest.Mock };
    let controller: ChatController;

    beforeEach(() => {
        redis = {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn().mockResolvedValue('OK'),
        };
        messageRepo = { conversationExists: jest.fn().mockResolvedValue(true) };
        dmUnreadRepo = { reset: jest.fn().mockResolvedValue(undefined) };
        userRepo = {
            findById: jest.fn().mockResolvedValue({ username: 'peer' }),
        };
        wsServer = { broadcastToUser: jest.fn() };

        controller = new ChatController(
            userRepo as any,
            messageRepo as any,
            dmUnreadRepo as any,
            {} as any,
            {} as any,
            {} as any,
            {} as any,
            { getClient: () => redis } as any,
            {} as any,
            {} as any,
            {} as any,
        );
        (controller as any).wsServer = wsServer as any;
    });

    it('writes no Redis key when no conversation exists', async () => {
        messageRepo.conversationExists.mockResolvedValue(false);

        const result = await controller.onMarkDmRead({ peerId: PEER_ID }, user);

        expect(result).toEqual({ success: true });
        expect(messageRepo.conversationExists).toHaveBeenCalledWith(
            USER_ID,
            PEER_ID,
        );
        expect(redis.setex).not.toHaveBeenCalled();
        expect(dmUnreadRepo.reset).not.toHaveBeenCalled();
        expect(wsServer.broadcastToUser).not.toHaveBeenCalled();
    });

    it('marks read when a conversation exists', async () => {
        const result = await controller.onMarkDmRead({ peerId: PEER_ID }, user);

        expect(result).toEqual({ success: true });
        expect(redis.setex).toHaveBeenCalledWith(
            `dm_read_ts:${USER_ID}:${PEER_ID}`,
            3600 * 24 * 7,
            expect.any(String),
        );
        expect(dmUnreadRepo.reset).toHaveBeenCalledWith(USER_ID, PEER_ID);
        expect(wsServer.broadcastToUser).toHaveBeenCalledWith(USER_ID, {
            type: 'dm_unread_updated',
            payload: { peerId: PEER_ID, peerUsername: 'peer', count: 0 },
        });
    });

    it('skips the lookup when a recent inbound DM proves the conversation', async () => {
        redis.get.mockImplementation(async (key: string) =>
            key.startsWith('dm_latest:') ? String(Date.now()) : null,
        );

        await controller.onMarkDmRead({ peerId: PEER_ID }, user);

        expect(messageRepo.conversationExists).not.toHaveBeenCalled();
        expect(redis.setex).toHaveBeenCalled();
    });

    it('does not spend a lookup on the already-read fast path', async () => {
        redis.get.mockImplementation(async (key: string) =>
            key.startsWith('dm_read_ts:') ? String(Date.now()) : null,
        );

        await controller.onMarkDmRead({ peerId: PEER_ID }, user);

        expect(messageRepo.conversationExists).not.toHaveBeenCalled();
        expect(redis.setex).not.toHaveBeenCalled();
    });

    it('rejects an unauthenticated caller', async () => {
        await expect(
            controller.onMarkDmRead({ peerId: PEER_ID }, undefined),
        ).rejects.toMatchObject({
            status: 401,
            message: 'Authentication required',
        });
    });
});
