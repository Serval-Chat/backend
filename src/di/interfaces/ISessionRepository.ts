import type { IUserSession } from '@/models/UserSession';

export interface ISessionRepository {
    create(data: {
        userId: string;
        tokenHash: string;
        userAgent: string;
        ip: string;
        durationDays: number;
        expiresAt: Date;
    }): Promise<IUserSession>;

    findByTokenHash(tokenHash: string): Promise<IUserSession | null>;

    findByUser(userId: string): Promise<IUserSession[]>;

    touch(tokenHash: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;

    deleteById(sessionId: string, userId: string): Promise<IUserSession | null>;

    deleteAllForUser(
        userId: string,
        exceptSessionId?: string,
    ): Promise<IUserSession[]>;

    updateIp(
        sessionId: string,
        userId: string,
        ip: string,
    ): Promise<IUserSession | null>;
}
