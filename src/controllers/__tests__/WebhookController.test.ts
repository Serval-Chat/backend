import { Types } from 'mongoose';
import { WebhookController } from '../WebhookController';

describe('WebhookController', () => {
    const serverId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    const messageId = new Types.ObjectId();
    const token = 'a'.repeat(128);

    const webhookRepo = {
        findByToken: jest.fn(),
    };
    const serverMessageRepo = {
        findById: jest.fn(),
        delete: jest.fn(),
    };
    const wsServer = {
        broadcastToChannel: jest.fn(),
        broadcastToServerWithPermission: jest.fn(),
    };

    let controller: WebhookController;

    beforeEach(() => {
        jest.clearAllMocks();
        webhookRepo.findByToken.mockResolvedValue({
            serverId,
            channelId,
            token,
        });
        serverMessageRepo.findById.mockResolvedValue({
            _id: messageId,
            serverId,
            channelId,
            isWebhook: true,
            deletedAt: undefined,
        });
        serverMessageRepo.delete.mockResolvedValue(true);
        wsServer.broadcastToServerWithPermission.mockResolvedValue(undefined);

        controller = new WebhookController(
            webhookRepo as never,
            {} as never,
            {} as never,
            serverMessageRepo as never,
            {} as never,
            {
                error: jest.fn(),
                debug: jest.fn(),
                warn: jest.fn(),
                info: jest.fn(),
            } as never,
            wsServer as never,
            {
                getClient: jest.fn().mockReturnValue({
                    set: jest.fn().mockResolvedValue('OK'),
                }),
            } as never,
            {} as never,
        );
    });

    it('deletes a webhook message and broadcasts deletion to channel subscribers and bots', async () => {
        const result = await controller.deleteWebhookMessage(
            { token },
            messageId.toString(),
        );

        expect(result).toEqual({
            message: 'Webhook message deleted successfully',
        });
        expect(serverMessageRepo.findById).toHaveBeenCalledWith(
            messageId,
            true,
        );
        expect(serverMessageRepo.delete).toHaveBeenCalledWith(messageId);

        const event = {
            type: 'message_server_deleted',
            payload: {
                messageId: messageId.toString(),
                serverId: serverId.toString(),
                channelId: channelId.toString(),
                hard: true,
            },
        };

        expect(wsServer.broadcastToChannel).toHaveBeenCalledWith(
            channelId.toString(),
            event,
        );
        expect(wsServer.broadcastToServerWithPermission).toHaveBeenCalledWith(
            serverId.toString(),
            event,
            {
                type: 'channel',
                targetId: channelId.toString(),
                permission: 'viewChannels',
            },
            undefined,
            undefined,
            { onlyBots: true },
        );
    });
});
