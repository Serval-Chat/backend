import { ForbiddenException } from '@nestjs/common';
import type { IWarningRepository } from '@/di/interfaces/IWarningRepository';

export const unacknowledgedWarningActionMessage = (action: string): string =>
    `You have an unacknowledged warning and cannot ${action} until you acknowledge it.`;

export async function assertHttpNotWarned(
    warningRepo: IWarningRepository,
    userId: string,
    action: string,
): Promise<void> {
    if (await warningRepo.hasUnacknowledged(userId)) {
        throw new ForbiddenException(
            unacknowledgedWarningActionMessage(action),
        );
    }
}

export async function assertWsNotWarned(
    warningRepo: IWarningRepository,
    userId: string,
    action: string,
): Promise<void> {
    if (await warningRepo.hasUnacknowledged(userId)) {
        throw new Error(
            `FORBIDDEN: ${unacknowledgedWarningActionMessage(action)}`,
        );
    }
}
