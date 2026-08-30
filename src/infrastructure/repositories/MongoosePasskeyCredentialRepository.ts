import { injectable } from 'inversify';
import { Model } from 'mongoose';
import { IPasskeyCredentialRepository } from '@/di/interfaces/IPasskeyCredentialRepository';
import {
    IPasskeyCredential,
    PasskeyCredential,
} from '@/models/PasskeyCredential';

@injectable()
export class MongoosePasskeyCredentialRepository implements IPasskeyCredentialRepository {
    private model: Model<IPasskeyCredential>;

    public constructor() {
        this.model = PasskeyCredential;
    }

    public async create(data: {
        userId: string;
        credentialId: string;
        publicKey: Buffer;
        counter: number;
        transports?: string[];
        deviceType: 'singleDevice' | 'multiDevice';
        backedUp: boolean;
        aaguid?: string;
        name: string;
    }): Promise<IPasskeyCredential> {
        return this.model.create({ ...data, lastUsedAt: null });
    }

    public async findByCredentialId(
        credentialId: string,
    ): Promise<IPasskeyCredential | null> {
        return this.model.findOne({ credentialId });
    }

    public async findByUser(userId: string): Promise<IPasskeyCredential[]> {
        return this.model.find({ userId }).sort({ createdAt: -1 });
    }

    public async findByIdForUser(
        id: string,
        userId: string,
    ): Promise<IPasskeyCredential | null> {
        return this.model.findOne({ snowflakeId: id, userId });
    }

    public async rename(
        id: string,
        userId: string,
        name: string,
    ): Promise<IPasskeyCredential | null> {
        return this.model.findOneAndUpdate(
            { snowflakeId: id, userId },
            { $set: { name } },
            { returnDocument: 'after' },
        );
    }

    public async updateCounter(
        credentialId: string,
        counter: number,
        lastUsedAt: Date,
    ): Promise<void> {
        await this.model.updateOne(
            { credentialId },
            { $set: { counter, lastUsedAt } },
        );
    }

    public async deleteByIdForUser(
        id: string,
        userId: string,
    ): Promise<IPasskeyCredential | null> {
        return this.model.findOneAndDelete({ snowflakeId: id, userId });
    }
}
