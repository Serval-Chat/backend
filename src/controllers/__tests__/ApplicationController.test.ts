import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
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

const req = {
    user: { id: new Types.ObjectId().toHexString(), isBot: true },
} as unknown as AuthenticatedRequest;

describe('ApplicationController', () => {
    let controller: ApplicationController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new ApplicationController(slashCommandRepo as never);
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
        const botId = new Types.ObjectId();
        (Bot.findOne as jest.Mock).mockReturnValue({
            lean: jest
                .fn()
                .mockResolvedValue({ _id: botId, userId: req.user.id }),
        });
        slashCommandRepo.create.mockResolvedValue({ _id: 'cmd-1' });

        await controller.setMyCommands(req, {
            commands: [{ name: 'PING', description: 'Ping command' }],
        });

        expect(slashCommandRepo.deleteByBotId).toHaveBeenCalledWith(botId);
        expect(slashCommandRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'ping' }),
        );
    });
});
