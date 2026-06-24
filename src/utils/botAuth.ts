import { Bot } from '@/models/Bot';
import type { JWTPayload } from '@/utils/jwt';

type PopulatedBotTokenUser = {
    snowflakeId: string;
    username: string;
    tokenVersion: number;
    deletedAt?: Date;
    isBot: boolean;
};

type LeanBotForAuth = {
    clientId: string;
    userIdUser?: PopulatedBotTokenUser | null;
};

/**
 * verifies a hashed bot token and resolves it to a JWTPayload, mirroring the
 * shape produced for human users. shared by Express middleware, Nest guard,
 * and WS auth so the Bot.userIdUser populate/cast lives in exactly one place.
 */
export async function resolveBotAuthPayload(
    tokenHash: string,
): Promise<JWTPayload | null> {
    const bot = (await Bot.findOne({ botTokenHash: tokenHash })
        .select('+botTokenHash')
        .populate(
            'userIdUser',
            'username tokenVersion deletedAt isBot snowflakeId',
        )
        .lean()) as LeanBotForAuth | null;

    if (
        bot === null ||
        bot.userIdUser === null ||
        bot.userIdUser === undefined
    ) {
        return null;
    }

    if (bot.userIdUser.deletedAt !== undefined) {
        return null;
    }

    return {
        type: 'access',
        id: bot.userIdUser.snowflakeId,
        login: `bot.${bot.clientId}`,
        username: bot.userIdUser.username,
        tokenVersion: bot.userIdUser.tokenVersion,
        isBot: true,
    };
}
