import { BadRequestException } from '@nestjs/common';
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
    },
}));

import { Bot } from '@/models/Bot';
import { ServerMember, ServerMessage } from '@/models/Server';
import { InteractionController } from '../InteractionController';

const wsServer = {
    broadcastToChannel: jest.fn(),
    broadcastToServerWithPermission: jest.fn(),
};
const slashCommandRepo = {
    findByBotId: jest.fn(),
    findByNameAndBotIds: jest.fn(),
};

const permissionService = {
    hasChannelPermission: jest.fn(),
    getAllServerPermissions: jest.fn(),
};

const serverMemberRepo = {
    findByServerAndUser: jest.fn(),
    findById: jest.fn(),
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
        );
    });

    it('rejects createInteraction when required option is missing', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const channelId = new Types.ObjectId().toHexString();
        const botUserId = new Types.ObjectId();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (ServerMember.find as jest.Mock).mockReturnValue(
            chainResult([{ userId: { _id: botUserId, isBot: true } }]),
        );
        (Bot.find as jest.Mock).mockReturnValue(
            chainResult([{ _id: new Types.ObjectId(), userId: botUserId }]),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (slashCommandRepo.findByNameAndBotIds as jest.Mock).mockResolvedValue({
            options: [{ name: 'target', required: true }],
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
        const invocationId = new Types.ObjectId();

        (ServerMember.findOne as jest.Mock).mockReturnValue(
            chainResult({ _id: 'member' }),
        );
        (ServerMember.find as jest.Mock).mockReturnValue(
            chainResult([{ userId: { _id: botUserId, isBot: true } }]),
        );
        (Bot.find as jest.Mock).mockReturnValue(
            chainResult([{ _id: new Types.ObjectId(), userId: botUserId }]),
        );
        (permissionService.hasChannelPermission as jest.Mock).mockResolvedValue(
            true,
        );
        (slashCommandRepo.findByNameAndBotIds as jest.Mock).mockResolvedValue({
            options: [{ name: 'target', required: false }],
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
});
