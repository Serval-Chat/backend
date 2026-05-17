import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import type { IMuteRepository } from '@/di/interfaces/IMuteRepository';

export const mutedActionMessage = (action: string): string =>
    `You are currently muted and cannot ${action}.`;

export async function isUserMuted(
    muteRepo: IMuteRepository,
    userId: string | Types.ObjectId,
): Promise<boolean> {
    const userOid =
        typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    await muteRepo.checkExpired(userOid);
    return (await muteRepo.findActiveByUserId(userOid)) !== null;
}

export async function assertHttpNotMuted(
    muteRepo: IMuteRepository,
    userId: string | Types.ObjectId,
    action: string,
): Promise<void> {
    if (await isUserMuted(muteRepo, userId)) {
        throw new ForbiddenException(mutedActionMessage(action));
    }
}

export async function assertWsNotMuted(
    muteRepo: IMuteRepository,
    userId: string | Types.ObjectId,
    action: string,
): Promise<void> {
    if (await isUserMuted(muteRepo, userId)) {
        throw new Error(`FORBIDDEN: ${mutedActionMessage(action)}`);
    }
}
