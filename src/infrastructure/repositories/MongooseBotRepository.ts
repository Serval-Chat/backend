import { injectable } from 'inversify';
import type { QueryFilter } from 'mongoose';
import { Bot, type IBot } from '@/models/Bot';
import type {
    BotVerificationChanges,
    BotWithUser,
    IBotRepository,
} from '@/di/interfaces/IBotRepository';

@injectable()
export class MongooseBotRepository implements IBotRepository {
    public async findByUserId(userId: string): Promise<IBot | null> {
        return await Bot.findOne({ userId }).lean();
    }

    public async findByClientId(clientId: string): Promise<IBot | null> {
        return await Bot.findOne({ clientId }).lean();
    }

    public async listForAdmin(options: {
        userIds?: string[];
        limit: number;
        offset: number;
    }): Promise<BotWithUser[]> {
        return await this.listWithUsers(
            options.userIds === undefined
                ? {}
                : { userId: { $in: options.userIds } },
            options,
        );
    }

    public async listAwaitingReview(options: {
        limit: number;
        offset: number;
    }): Promise<BotWithUser[]> {
        return await this.listWithUsers(
            { verificationRequested: true },
            options,
        );
    }

    public async countAwaitingReview(): Promise<number> {
        return await Bot.countDocuments({ verificationRequested: true });
    }

    public async updateVerification(
        clientId: string,
        changes: BotVerificationChanges,
    ): Promise<void> {
        await Bot.updateOne({ clientId }, changes);
    }

    private async listWithUsers(
        filter: QueryFilter<IBot>,
        options: { limit: number; offset: number },
    ): Promise<BotWithUser[]> {
        return await Bot.find(filter)
            .populate('userIdUser', 'username displayName profilePicture')
            .sort({ createdAt: -1 })
            .skip(options.offset)
            .limit(options.limit)
            .lean<BotWithUser[]>();
    }
}
