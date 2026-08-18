import { Ban } from '@/models/Ban';
import { Bot } from '@/models/Bot';
import { resolveBotAuthPayload } from '../botAuth';

jest.mock('@/models/Ban', () => ({
    Ban: { checkExpired: jest.fn(), findOne: jest.fn() },
}));
jest.mock('@/models/Bot', () => ({ Bot: { findOne: jest.fn() } }));

interface MockedModel {
    findOne: jest.Mock;
    checkExpired: jest.Mock;
}

/** The models are jest.mock'd above; this names what they actually are. */
function mocked(model: unknown): MockedModel {
    return model as MockedModel;
}

const botModel = mocked(Bot);
const banModel = mocked(Ban);

function botRecord(overrides: Record<string, unknown> = {}) {
    return {
        clientId: 'client-1',
        userIdUser: {
            snowflakeId: 'bot-user-1',
            username: 'somebot',
            isBot: true,
            ...overrides,
        },
    };
}

/** Bot.findOne(...).select(...).populate(...).lean() */
function mockBot(result: unknown) {
    botModel.findOne.mockReturnValue({
        select: () => ({
            populate: () => ({ lean: () => Promise.resolve(result) }),
        }),
    });
}

function mockBan(result: unknown) {
    banModel.findOne.mockReturnValue({ lean: () => Promise.resolve(result) });
}

describe('resolveBotAuthPayload', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        banModel.checkExpired.mockResolvedValue(undefined);
        mockBan(null);
    });

    it('resolves a bot whose account is not banned', async () => {
        mockBot(botRecord());

        await expect(resolveBotAuthPayload('hash')).resolves.toEqual({
            type: 'access',
            id: 'bot-user-1',
            login: 'bot.client-1',
            username: 'somebot',
            isBot: true,
        });
    });

    it('refuses a bot whose account is banned', async () => {
        mockBot(botRecord());
        mockBan({ userId: 'bot-user-1', active: true, reason: 'spam' });

        await expect(resolveBotAuthPayload('hash')).resolves.toBeNull();
    });

    it('expires stale bans first, so a lapsed ban does not lock the bot out', async () => {
        mockBot(botRecord());

        await resolveBotAuthPayload('hash');

        expect(banModel.checkExpired).toHaveBeenCalledWith('bot-user-1');

        const [expiredAt] = banModel.checkExpired.mock.invocationCallOrder;
        const [lookedUpAt] = banModel.findOne.mock.invocationCallOrder;
        expect(expiredAt).toBeDefined();
        expect(lookedUpAt).toBeDefined();
        expect(expiredAt).toBeLessThan(lookedUpAt as number);
    });

    it('checks the ban against the bot account, not the client id', async () => {
        mockBot(botRecord());

        await resolveBotAuthPayload('hash');

        expect(banModel.findOne).toHaveBeenCalledWith({
            userId: 'bot-user-1',
            active: true,
        });
    });

    it('still refuses a deleted account without consulting bans', async () => {
        mockBot(botRecord({ deletedAt: new Date() }));

        await expect(resolveBotAuthPayload('hash')).resolves.toBeNull();
        expect(banModel.findOne).not.toHaveBeenCalled();
    });

    it('refuses an unknown token', async () => {
        mockBot(null);

        await expect(resolveBotAuthPayload('hash')).resolves.toBeNull();
    });
});
