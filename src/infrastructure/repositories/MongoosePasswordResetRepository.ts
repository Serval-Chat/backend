import { injectable } from 'inversify';
import { Model, Types } from 'mongoose';
import { IPasswordResetRepository } from '@/di/interfaces/IPasswordResetRepository';
import { IPasswordReset, PasswordReset } from '@/models/PasswordReset';
import { RateLimitError } from '@/utils/RateLimitError';

@injectable()
export class MongoosePasswordResetRepository
    implements IPasswordResetRepository {
    private model: Model<IPasswordReset>;

    constructor() {
        this.model = PasswordReset;
    }

    async create(data: {
        userId: Types.ObjectId;
        hashedToken: string;
        expiresAt: Date;
        ipParam?: string;
    }): Promise<IPasswordReset> {
        return this.model.create(data);
    }

    async findByHashedToken(
        hashedToken: string,
    ): Promise<IPasswordReset | null> {
        return this.model.findOne({
            hashedToken,
            usedAt: null,
            expiresAt: { $gt: new Date() },
        });
    }

    async markAsUsed(hashedToken: string): Promise<IPasswordReset | null> {
        return this.model.findOneAndUpdate(
            {
                hashedToken,
                usedAt: null,
                expiresAt: { $gt: new Date() },
            },
            { $set: { usedAt: new Date() } },
            { new: true },
        );
    }

    async deleteByUser(userId: Types.ObjectId): Promise<void> {
        await this.model.deleteMany({ userId });
    }

    async countActiveRequestsByUser(
        userId: Types.ObjectId,
        windowStart: Date,
    ): Promise<number> {
        return this.model.countDocuments({
            userId,
            createdAt: { $gte: windowStart },
            usedAt: null,
        });
    }

    async countActiveRequestsByIp(
        ip: string,
        windowStart: Date,
    ): Promise<number> {
        return this.model.countDocuments({
            ipParam: ip,
            createdAt: { $gte: windowStart },
            usedAt: null,
        });
    }

    async createIfUnderLimit(
        data: {
            userId: Types.ObjectId;
            hashedToken: string;
            expiresAt: Date;
            ipParam: string;
        },
        limits: {
            maxPerUser: number;
            maxPerIp: number;
        },
        windowStart: Date,
    ): Promise<IPasswordReset | null> {
        const session = await this.model.db.startSession();
        let result: IPasswordReset | null = null;

        try {
            await session.withTransaction(async () => {
                const userCount = await this.model
                    .countDocuments({
                        userId: data.userId,
                        createdAt: { $gte: windowStart },
                        usedAt: null,
                    })
                    .session(session);

                if (userCount >= limits.maxPerUser) {
                    throw new RateLimitError('USER');
                }

                const ipCount = await this.model
                    .countDocuments({
                        ipParam: data.ipParam,
                        createdAt: { $gte: windowStart },
                        usedAt: null,
                    })
                    .session(session);

                if (ipCount >= limits.maxPerIp) {
                    throw new RateLimitError('IP');
                }

                const created = await this.model.create([data], { session });
                result = created[0] || null;
            });
        } catch (error: unknown) {
            if (error instanceof RateLimitError) {
                return null;
            }
            throw error;
        } finally {
            await session.endSession();
        }

        return result;
    }
}
