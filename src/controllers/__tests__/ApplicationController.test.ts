import { ForbiddenException } from '@nestjs/common';
import { generateSnowflakeId } from '@/utils/snowflake';
import type { AuthenticatedRequest } from '@/middleware/auth';

jest.mock('@/models/Bot', () => ({
    Bot: {
        findOne: jest.fn(),
    },
}));

import { Bot } from '@/models/Bot';
import { ApplicationController } from '../ApplicationController';

const slashCommandRepo = {
    findByBotId: jest.fn(),
    deleteByBotId: jest.fn(),
    create: jest.fn(),
};
const serverMemberRepo = {
    findServerIdsByUserId: jest.fn().mockResolvedValue([]),
};
const wsServer = {
    broadcastToServer: jest.fn(),
};

const req = {
    user: { id: generateSnowflakeId(), isBot: true },
} as AuthenticatedRequest;

describe('ApplicationController', () => {
    let controller: ApplicationController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new ApplicationController(
            slashCommandRepo as never,
            serverMemberRepo as never,
            wsServer as never,
        );
    });

    it('rejects getMyCommands when token does not belong to bot', async () => {
        (Bot.findOne as jest.Mock).mockReturnValue({
            lean: jest.fn().mockResolvedValue(null),
        });

        await expect(controller.getMyCommands(req)).rejects.toThrow(
            ForbiddenException,
        );
    });

    it('setMyCommands lowercases names and overwrites existing commands', async () => {
        const botId = generateSnowflakeId();
        (Bot.findOne as jest.Mock).mockReturnValue({
            lean: jest
                .fn()
                .mockResolvedValue({ snowflakeId: botId, userId: req.user.id }),
        });
        slashCommandRepo.create.mockResolvedValue({ snowflakeId: 'cmd-1' });

        await controller.setMyCommands(req, {
            commands: [{ name: 'PING', description: 'Ping command' }],
        });

        expect(slashCommandRepo.deleteByBotId).toHaveBeenCalledWith(botId);
        expect(slashCommandRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'ping' }),
        );
    });

    it('broadcasts command updates to servers the bot is in', async () => {
        const botId = generateSnowflakeId();
        const botUserId = generateSnowflakeId();
        const serverId = generateSnowflakeId();
        (Bot.findOne as jest.Mock).mockReturnValue({
            lean: jest
                .fn()
                .mockResolvedValue({ snowflakeId: botId, userId: botUserId }),
        });
        slashCommandRepo.create.mockResolvedValue({ snowflakeId: 'cmd-1' });
        serverMemberRepo.findServerIdsByUserId.mockResolvedValue([serverId]);

        await controller.setMyCommands(req, {
            commands: [{ name: 'PING', description: 'Ping command' }],
        });

        expect(wsServer.broadcastToServer).toHaveBeenCalledWith(
            serverId.toString(),
            {
                type: 'commands_updated',
                payload: {
                    serverId: serverId.toString(),
                    botId,
                },
            },
        );
    });
});
