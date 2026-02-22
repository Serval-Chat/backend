import type { Types } from 'mongoose';
import type { IPasswordReset } from '@/models/PasswordReset';

export interface IPasswordResetRepository {
    create(data: {
        userId: Types.ObjectId;
        hashedToken: string;
        expiresAt: Date;
        ipParam?: string;
    }): Promise<IPasswordReset>;

    findByHashedToken(hashedToken: string): Promise<IPasswordReset | null>;

    markAsUsed(hashedToken: string): Promise<IPasswordReset | null>;

    deleteByUser(userId: Types.ObjectId): Promise<void>;

    countActiveRequestsByUser(
        userId: Types.ObjectId,
        windowStart: Date,
    ): Promise<number>;

    countActiveRequestsByIp(ip: string, windowStart: Date): Promise<number>;
    createIfUnderLimit(
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
    ): Promise<IPasswordReset | null>;
}
