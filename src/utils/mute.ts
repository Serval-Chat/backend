import { ForbiddenException } from '@nestjs/common';
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';

export const mutedActionMessage = (action: string): string =>
    `You are currently muted and cannot ${action}.`;

export async function isUserMuted(
    muteRepo: IMuteRepository,
    userId: string,
): Promise<boolean> {
    await muteRepo.checkExpired(userId);
    return (await muteRepo.findActiveByUserId(userId)) !== null;
}

export async function assertHttpNotMuted(
    muteRepo: IMuteRepository,
    userId: string,
    action: string,
): Promise<void> {
    if (await isUserMuted(muteRepo, userId)) {
        throw new ForbiddenException(mutedActionMessage(action));
    }
}

export async function assertWsNotMuted(
    muteRepo: IMuteRepository,
    userId: string,
    action: string,
): Promise<void> {
    if (await isUserMuted(muteRepo, userId)) {
        throw new Error(`FORBIDDEN: ${mutedActionMessage(action)}`);
    }
}
