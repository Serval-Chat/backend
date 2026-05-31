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
        broadcastToServer: jest.fn(),
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
        serverMessageRepo.create.mockResolvedValue({
            _id: messageId,
            createdAt: new Date('2026-05-31T12:00:00.000Z'),
            attachments: [],
        });
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

    it('translates GitHub push deliveries into Serchat webhook messages', async () => {
        await controller.executeWebhook(
            { token },
            {
                ref: 'refs/heads/main',
                before: '1111111',
                after: '2222222',
                sender: {
                    login: 'octocat',
                    avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
                },
                repository: {
                    full_name: 'octocat/Hello-World',
                    html_url: 'https://github.com/octocat/Hello-World',
                },
                commits: [
                    {
                        id: '2222222abcdef',
                        message: 'Fix the thing\n\nDetails',
                        url: 'https://github.com/octocat/Hello-World/commit/2222222abcdef',
                        author: {
                            username: 'octocat',
                        },
                    },
                ],
            } as never,
            {
                'x-github-event': 'push',
                'user-agent': 'GitHub-Hookshot/abc123',
            },
        );

        expect(serverMessageRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                text: expect.stringContaining('**octocat** pushed [1 commit]'),
                webhookUsername: 'GitHub',
                webhookAvatarUrl:
                    'https://avatars.githubusercontent.com/u/1?v=4',
                noEmbeds: true,
            }),
        );
        expect(serverMessageRepo.create.mock.calls[0][0].text).toContain(
            '- [2222222](https://github.com/octocat/Hello-World/commit/2222222abcdef) Fix the thing - octocat',
        );
    });

    it('detects GitHub deliveries from the Hookshot user agent', async () => {
        await controller.executeWebhook(
            { token },
            {
                action: 'opened',
                sender: { login: 'octocat' },
                repository: { full_name: 'octocat/Hello-World' },
                issue: {
                    number: 12,
                    title: 'Bug report',
                    html_url:
                        'https://github.com/octocat/Hello-World/issues/12',
                },
            } as never,
            {
                'user-agent': 'GitHub-Hookshot/abc123',
            },
        );

        expect(serverMessageRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                text: '**octocat** triggered GitHub `github` (opened) in octocat/Hello-World',
                webhookUsername: 'GitHub',
                noEmbeds: true,
            }),
        );
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
