import { injectable } from 'inversify';
import { Model } from 'mongoose';
import { ISessionRepository } from '@/di/interfaces/ISessionRepository';
import { IUserSession, UserSession } from '@/models/UserSession';

@injectable()
export class MongooseSessionRepository implements ISessionRepository {
    private model: Model<IUserSession>;

    public constructor() {
        this.model = UserSession;
    }

    public async create(data: {
        userId: string;
        tokenHash: string;
        userAgent: string;
        ip: string;
        durationDays: number;
        expiresAt: Date;
    }): Promise<IUserSession> {
        return this.model.create({ ...data, lastSeenAt: new Date() });
    }

    public async findByTokenHash(
        tokenHash: string,
    ): Promise<IUserSession | null> {
        return this.model.findOne({
            tokenHash,
            expiresAt: { $gt: new Date() },
        });
    }

    public async findByUser(userId: string): Promise<IUserSession[]> {
        return this.model
            .find({ userId, expiresAt: { $gt: new Date() } })
            .sort({ lastSeenAt: -1 });
    }

    public async touch(
        tokenHash: string,
        lastSeenAt: Date,
        expiresAt: Date,
    ): Promise<void> {
        await this.model.updateOne(
            { tokenHash },
            { $set: { lastSeenAt, expiresAt } },
        );
    }

    public async deleteById(
        sessionId: string,
        userId: string,
    ): Promise<IUserSession | null> {
        return this.model.findOneAndDelete({
            snowflakeId: sessionId,
            userId,
        });
    }

    public async deleteAllForUser(
        userId: string,
        exceptSessionId?: string,
    ): Promise<IUserSession[]> {
        const filter: Record<string, unknown> = { userId };
        if (exceptSessionId !== undefined) {
            filter.snowflakeId = { $ne: exceptSessionId };
        }

        const sessions = await this.model.find(filter);
        if (sessions.length === 0) return [];

        await this.model.deleteMany({
            _id: { $in: sessions.map((session) => session._id) },
        });

        return sessions;
    }

    public async updateIp(
        sessionId: string,
        userId: string,
        ip: string,
    ): Promise<IUserSession | null> {
        return this.model.findOneAndUpdate(
            { snowflakeId: sessionId, userId },
            { $set: { ip } },
            { returnDocument: 'after' },
        );
    }
}
