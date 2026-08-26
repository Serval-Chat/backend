import type { IRedisService } from '@/di/interfaces/IRedisService';
import type { IMessageRepository } from '@/di/interfaces/IMessageRepository';
import { ApiError } from '@/utils/ApiError';
import { ErrorMessages } from '@/constants/errorMessages';
import logger from '@/utils/logger';

function slowModeRejection(remainingMs: number): ApiError {
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    return new ApiError(
        403,
        ErrorMessages.MESSAGE.SLOW_MODE.replace('%s', `${remainingSeconds}s`),
    );
}

export async function assertSlowModeAllows(
    redisService: IRedisService,
    messageRepo: IMessageRepository,
    channelId: string,
    userId: string,
    cooldownMs: number,
): Promise<void> {
    if (cooldownMs <= 0) return;

    const key = `slowmode:${channelId}:${userId}`;

    try {
        const redis = redisService.getClient();
        const claimed = await redis.set(key, '1', 'PX', cooldownMs, 'NX');
        if (claimed !== null) return;

        const remainingMs = await redis.pttl(key);
        throw slowModeRejection(remainingMs > 0 ? remainingMs : cooldownMs);
    } catch (err) {
        if (err instanceof ApiError) throw err;

        logger.error(
            `[SlowMode] Slow-mode claim failed, falling back to the message history: ${(err as Error).message}`,
        );

        const lastMessage = await messageRepo.findLastByChannelAndUser(
            channelId,
            userId,
        );
        if (!lastMessage) return;

        const elapsed =
            Date.now() - (lastMessage.createdAt ?? new Date(0)).getTime();
        if (elapsed < cooldownMs) {
            throw slowModeRejection(cooldownMs - elapsed);
        }
    }
}
