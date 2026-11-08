import { injectable } from 'inversify';
import { UserConnection, type IUserConnection } from '@/models/UserConnection';
import type { IUserConnectionRepository } from '@/di/interfaces/IUserConnectionRepository';
import { WEBSITE_CONNECTION_TYPE } from '@/utils/websiteConnections';

@injectable()
export class MongooseUserConnectionRepository implements IUserConnectionRepository {
    public async findVerifiedByUser(
        userId: string,
    ): Promise<IUserConnection[]> {
        return await UserConnection.find({ userId, status: 'verified' })
            .sort({ verifiedAt: 1, createdAt: 1 })
            .exec();
    }

    public async findAllByUser(userId: string): Promise<IUserConnection[]> {
        return await UserConnection.find({ userId })
            .sort({ status: 1, verifiedAt: 1, createdAt: 1 })
            .exec();
    }

    public async isWebsiteVerifiedByOtherUser(
        normalizedValue: string,
        userId: string,
    ): Promise<boolean> {
        const match = await UserConnection.exists({
            type: WEBSITE_CONNECTION_TYPE,
            normalizedValue,
            status: 'verified',
            userId: { $ne: userId },
        });
        return match !== null;
    }

    public async isWebsiteVerifiedByUser(
        userId: string,
        normalizedValue: string,
    ): Promise<boolean> {
        const match = await UserConnection.exists({
            userId,
            type: WEBSITE_CONNECTION_TYPE,
            normalizedValue,
            status: 'verified',
        });
        return match !== null;
    }

    public async startWebsiteVerification(data: {
        userId: string;
        value: string;
        normalizedValue: string;
        verificationTokenHash: string;
        verificationRecordName: string;
        expiresAt: Date;
    }): Promise<IUserConnection> {
        const connection =
            (await UserConnection.findOne({
                userId: data.userId,
                type: WEBSITE_CONNECTION_TYPE,
                normalizedValue: data.normalizedValue,
            }).exec()) ??
            new UserConnection({
                userId: data.userId,
                type: WEBSITE_CONNECTION_TYPE,
                value: data.value,
                normalizedValue: data.normalizedValue,
            });

        connection.value = data.value;
        connection.status = 'pending';
        connection.verificationTokenHash = data.verificationTokenHash;
        connection.verificationRecordName = data.verificationRecordName;
        connection.expiresAt = data.expiresAt;
        connection.verifiedAt = undefined;

        return await connection.save();
    }

    public async findWebsiteForUser(
        connectionId: string,
        userId: string,
    ): Promise<IUserConnection | null> {
        return await UserConnection.findOne({
            snowflakeId: connectionId,
            userId,
            type: WEBSITE_CONNECTION_TYPE,
        }).exec();
    }

    public async markVerified(
        connectionId: string,
        userId: string,
    ): Promise<IUserConnection | null> {
        const connection = await this.findWebsiteForUser(connectionId, userId);
        if (connection === null) return null;

        connection.status = 'verified';
        connection.verificationTokenHash = undefined;
        connection.verificationRecordName = undefined;
        connection.expiresAt = undefined;
        connection.verifiedAt = new Date();
        return await connection.save();
    }

    public async deleteForUser(
        connectionId: string,
        userId: string,
    ): Promise<boolean> {
        const deleted = await UserConnection.findOneAndDelete({
            snowflakeId: connectionId,
            userId,
        }).exec();
        return deleted !== null;
    }
}
