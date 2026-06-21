import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';

jest.mock('@/models/Bot', () => ({
    Bot: {
        find: jest.fn(),
    },
}));

jest.mock('@/models/Server', () => ({
    ServerMember: {
        findOne: jest.fn(),
        find: jest.fn(),
    },
    ServerMessage: {
        create: jest.fn(),
        findOne: jest.fn(),
    },
}));

jest.mock('@/models/User', () => ({
    User: {
        findById: jest.fn(),
    },
}));

import { Bot } from '@/models/Bot';
import { ServerMember, ServerMessage } from '@/models/Server';
import { User } from '@/models/User';
import { InteractionController } from '../InteractionController';
import { IsHumanGuard } from '@/modules/auth/bot.guard';

const wsServer = {
    broadcastToUser: jest.fn(),
    broadcastToChannel: jest.fn(),
    broadcastToServerWithPermission: jest.fn(),
};
const slashCommandRepo = {
    findByBotId: jest.fn(),
    findByNameAndBotIds: jest.fn(),
    findById: jest.fn(),
};

const permissionService = {
    hasChannelPermission: jest.fn(),
    requireChannelPermission: jest.fn(async function (
        this: {
            hasChannelPermission: (...args: unknown[]) => Promise<boolean>;
        },
        serverId: unknown,
        userId: unknown,
        channelId: unknown,
        permission: unknown,
        error: Error,
    ) {
        if (
            (await this.hasChannelPermission(
                serverId,
                userId,
                channelId,
                permission,
            )) !== true
        ) {
            throw error;
        }
    }),
    getAllServerPermissions: jest.fn(),
};

const serverMemberRepo = {
    findByServerAndUser: jest.fn(),
    findById: jest.fn(),
};
const muteRepo = {
    checkExpired: jest.fn().mockResolvedValue(undefined),
    findActiveByUserId: jest.fn().mockResolvedValue(null),
};

const req = {
    user: {
        id: new Types.ObjectId().toHexString(),
        username: 'alice',
    },
} as never;

function chainResult(value: unknown) {
    return {
        populate: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(value),
    };
}

describe('InteractionController', () => {
    let controller: InteractionController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new InteractionController(
            wsServer as never,
            slashCommandRepo as never,
            permissionService as never,
            serverMemberRepo as never,
            muteRepo as never,
        );
        muteRepo.findActiveByUserId.mockResolvedValue(null);
    });

    it('marks interaction creation as human-only', () => {
        const guards =
            Reflect.getMetadata(
                GUARDS_METADATA,
                InteractionController.prototype.createInteraction,
            ) ?? [];

        expect(guards).toContain(IsHumanGuard);
    });

    it('rejects muted users before command validation', async () => {
        const userId = (req as { user: { id: string } }).user.id;
        muteRepo.findActiveByUserId.mockResolvedValue({
            _id: new Types.ObjectId(),
            userId: new Types.ObjectId(userId),
        });

        await expect(
            controller.createInteraction(req, {
                command: 'ban',
                options: [],
                serverId: new Types.ObjectId().toHexString(),
                channelId: new Types.ObjectId().toHexString(),
            }),
        ).rejects.toThrow(ForbiddenException);

        expect(ServerMember.findOne).not.toHaveBeenCalled();
        expect(slashCommandRepo.findByNameAndBotIds).not.toHaveBeenCalled();
    });

    it('rejects bot users before command validation', async () => {
        const botReq = {
            user: {
                id: new Types.ObjectId().toHexString(),
                username: 'helper-bot',
                isBot: true,
            },
        } as never;

        await expect(
            controller.createInteraction(botReq, {
                command: 'wave',
                options: [],
                serverId: new Types.ObjectId().toHexString(),
                channelId: new Types.ObjectId().toHexString(),
            }),
        ).rejects.toThrow(ForbiddenException);

        expect(muteRepo.findActiveByUserId).not.toHaveBeenCalled();
        expect(ServerMember.findOne).not.toHaveBeenCalled();
        expect(slashCommandRepo.findByNameAndBotIds).not.toHaveBeenCalled();
    });

    it('rejects createInteraction when required option is missing', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const channelId = new Types.ObjectId().toHexString();
        const botUserId = new Types.ObjectId();
        const botId = new Types.ObjectId();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (ServerMember.find as jest.Mock).mockReturnValue(
            chainResult([{ userId: { _id: botUserId, isBot: true } }]),
        );
        (Bot.find as jest.Mock).mockReturnValue(
            chainResult([{ _id: botId, userId: botUserId }]),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (slashCommandRepo.findByNameAndBotIds as jest.Mock).mockResolvedValue({
            _id: new Types.ObjectId(),
            botId,
            name: 'ban',
            description: 'Ban',
            options: [{ name: 'target', type: 3, required: true }],
            shouldReply: false,
        });

        await expect(
            controller.createInteraction(req, {
                command: 'ban',
                options: [],
                serverId,
                channelId,
            }),
        ).rejects.toThrow(BadRequestException);
    });

    it('creates invocation message and broadcasts when shouldReply is true', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const channelId = new Types.ObjectId().toHexString();
        const botUserId = new Types.ObjectId();
        const botId = new Types.ObjectId();
        const invocationId = new Types.ObjectId();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (ServerMember.find as jest.Mock).mockReturnValue(
            chainResult([{ userId: { _id: botUserId, isBot: true } }]),
        );
        (Bot.find as jest.Mock).mockReturnValue(
            chainResult([{ _id: botId, userId: botUserId }]),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (slashCommandRepo.findByNameAndBotIds as jest.Mock).mockResolvedValue({
            _id: new Types.ObjectId(),
            botId,
            name: 'wave',
            description: 'Wave',
            options: [{ name: 'target', type: 3, required: false }],
            shouldReply: true,
        });
        (ServerMessage.create as jest.Mock).mockResolvedValue({
            _id: invocationId,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
        });

        const res = await controller.createInteraction(req, {
            command: 'wave',
            options: [{ name: 'target', value: 'u1' }],
            serverId,
            channelId,
        });

        expect(res).toEqual({ success: true });
        expect(ServerMessage.create).toHaveBeenCalled();
        expect(wsServer.broadcastToChannel).toHaveBeenCalledWith(
            channelId,
            expect.objectContaining({
                type: 'message_server',
                payload: expect.objectContaining({
                    interaction: expect.objectContaining({ command: 'wave' }),
                }),
            }),
        );
    });

    it('resolves command by commandId and sends the interaction to that bot only', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const channelId = new Types.ObjectId().toHexString();
        const botUserId = new Types.ObjectId();
        const botId = new Types.ObjectId();
        const commandId = new Types.ObjectId();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (ServerMember.find as jest.Mock).mockReturnValue(
            chainResult([{ userId: { _id: botUserId, isBot: true } }]),
        );
        (Bot.find as jest.Mock).mockReturnValue(
            chainResult([{ _id: botId, userId: botUserId }]),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (slashCommandRepo.findById as jest.Mock).mockResolvedValue({
            _id: commandId,
            botId,
            name: 'wave',
            description: 'Wave',
            options: [],
            shouldReply: false,
        });

        const res = await controller.createInteraction(req, {
            command: 'wave',
            commandId: commandId.toHexString(),
            options: [],
            serverId,
            channelId,
        });

        expect(res).toEqual({ success: true });
        expect(slashCommandRepo.findById).toHaveBeenCalledWith(commandId);
        expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
            botUserId.toHexString(),
            expect.objectContaining({
                type: 'interaction_create_server',
                payload: expect.objectContaining({
                    command: 'wave',
                    commandId: commandId.toHexString(),
                }),
            }),
        );
        expect(wsServer.broadcastToServerWithPermission).not.toHaveBeenCalled();
    });

    it('rejects commandId when the owning bot is not in the server', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const channelId = new Types.ObjectId().toHexString();
        const botUserId = new Types.ObjectId();
        const serverBotId = new Types.ObjectId();
        const otherBotId = new Types.ObjectId();
        const commandId = new Types.ObjectId();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (ServerMember.find as jest.Mock).mockReturnValue(
            chainResult([{ userId: { _id: botUserId, isBot: true } }]),
        );
        (Bot.find as jest.Mock).mockReturnValue(
            chainResult([{ _id: serverBotId, userId: botUserId }]),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (slashCommandRepo.findById as jest.Mock).mockResolvedValue({
            _id: commandId,
            botId: otherBotId,
            name: 'wave',
            description: 'Wave',
            options: [],
            shouldReply: false,
        });

        await expect(
            controller.createInteraction(req, {
                command: 'wave',
                commandId: commandId.toHexString(),
                options: [],
                serverId,
                channelId,
            }),
        ).rejects.toThrow(BadRequestException);

        expect(wsServer.broadcastToUser).not.toHaveBeenCalled();
        expect(wsServer.broadcastToServerWithPermission).not.toHaveBeenCalled();
    });

    it('sends valid message button clicks only to the bot message author', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const channelId = new Types.ObjectId().toHexString();
        const messageId = new Types.ObjectId().toHexString();
        const botUserId = new Types.ObjectId();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (ServerMessage.findOne as jest.Mock).mockReturnValue(
            chainResult({
                _id: new Types.ObjectId(messageId),
                senderId: botUserId,
                components: [
                    {
                        type: 'button',
                        style: 'primary',
                        custom_id: 'cool',
                    },
                ],
            }),
        );
        (User.findById as jest.Mock).mockReturnValue(
            chainResult({ _id: botUserId, isBot: true }),
        );
        (
            permissionService.getAllServerPermissions as jest.Mock
        ).mockResolvedValue({ sendMessages: true });

        await expect(
            controller.createComponentInteraction(req, {
                serverId,
                channelId,
                messageId,
                componentIndex: 0,
                customId: 'cool',
            }),
        ).resolves.toEqual({ success: true });

        expect(wsServer.broadcastToUser).toHaveBeenCalledWith(
            botUserId.toString(),
            expect.objectContaining({
                type: 'component_interaction_create_server',
                payload: expect.objectContaining({
                    componentType: 'button',
                    customId: 'cool',
                    messageId,
                    componentIndex: 0,
                    senderId: (req as { user: { id: string } }).user.id,
                    senderPermissions: { sendMessages: true },
                }),
            }),
        );
    });

    it('rejects missing message buttons', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const channelId = new Types.ObjectId().toHexString();
        const messageId = new Types.ObjectId().toHexString();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (ServerMessage.findOne as jest.Mock).mockReturnValue(
            chainResult({
                _id: new Types.ObjectId(messageId),
                senderId: new Types.ObjectId(),
                components: [],
            }),
        );

        await expect(
            controller.createComponentInteraction(req, {
                serverId,
                channelId,
                messageId,
                componentIndex: 0,
                customId: 'missing',
            }),
        ).rejects.toThrow(BadRequestException);
    });
});
