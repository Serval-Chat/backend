import type { IBot } from '@/models/Bot';

export type BotWithUser = IBot & {
    userIdUser?: {
        username?: string;
        displayName?: string | null;
        profilePicture?: string;
    } | null;
};

export type BotVerificationChanges = Partial<
    Pick<IBot, 'verified' | 'verificationOverride' | 'verificationRequested'>
>;

export interface IBotRepository {
    findByUserId(userId: string): Promise<IBot | null>;
    findByClientId(clientId: string): Promise<IBot | null>;
    listForAdmin(options: {
        userIds?: string[];
        limit: number;
        offset: number;
    }): Promise<BotWithUser[]>;
    listAwaitingReview(options: {
        limit: number;
        offset: number;
    }): Promise<BotWithUser[]>;
    countAwaitingReview(): Promise<number>;
    updateVerification(
        clientId: string,
        changes: BotVerificationChanges,
    ): Promise<void>;
}
