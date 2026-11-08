import type { IUserConnection } from '@/models/UserConnection';

export interface IUserConnectionRepository {
    findVerifiedByUser(userId: string): Promise<IUserConnection[]>;
    findAllByUser(userId: string): Promise<IUserConnection[]>;
    isWebsiteVerifiedByOtherUser(
        normalizedValue: string,
        userId: string,
    ): Promise<boolean>;
    isWebsiteVerifiedByUser(
        userId: string,
        normalizedValue: string,
    ): Promise<boolean>;
    startWebsiteVerification(data: {
        userId: string;
        value: string;
        normalizedValue: string;
        verificationTokenHash: string;
        verificationRecordName: string;
        expiresAt: Date;
    }): Promise<IUserConnection>;
    findWebsiteForUser(
        connectionId: string,
        userId: string,
    ): Promise<IUserConnection | null>;
    markVerified(
        connectionId: string,
        userId: string,
    ): Promise<IUserConnection | null>;
    deleteForUser(connectionId: string, userId: string): Promise<boolean>;
}
