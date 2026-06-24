import type { IPasswordReset } from '@/models/PasswordReset';

export interface IPasswordResetRepository {
    create(data: {
        userId: string;
        hashedToken: string;
        expiresAt: Date;
        ipParam?: string;
    }): Promise<IPasswordReset>;

    findByHashedToken(hashedToken: string): Promise<IPasswordReset | null>;

    markAsUsed(hashedToken: string): Promise<IPasswordReset | null>;

    deleteByUser(userId: string): Promise<void>;

    countActiveRequestsByUser(
        userId: string,
        windowStart: Date,
    ): Promise<number>;

    countActiveRequestsByIp(ip: string, windowStart: Date): Promise<number>;
    createIfUnderLimit(
        data: {
            userId: string;
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
