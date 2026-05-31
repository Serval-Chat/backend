import { Types } from 'mongoose';
import { ForbiddenException } from '@nestjs/common';
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
        create: jest.fn(),
        findById: jest.fn(),
        delete: jest.fn(),
    };
    const channelRepo = {
        updateLastMessageAt: jest.fn(),
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
            channelRepo as never,
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

    it('rejects webhook messages with components', async () => {
        await expect(
            controller.executeWebhook(
                { token },
                {
                    content: 'hello',
                    components: [
                        {
                            type: 'button',
                            style: 'primary',
                            label: 'Nope',
                            custom_id: 'nope',
                        },
                    ],
                },
            ),
        ).rejects.toThrow(ForbiddenException);

        expect(serverMessageRepo.create).not.toHaveBeenCalled();
    });

    it('deletes a webhook message and broadcasts deletion to channel subscribers and bots', async () => {
        const result = await controller.deleteWebhookMessage({
            token,
            messageId: messageId.toString(),
        });

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
