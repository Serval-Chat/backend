import type { IPasskeyCredential } from '@/models/PasskeyCredential';

export interface IPasskeyCredentialRepository {
    create(data: {
        userId: string;
        credentialId: string;
        publicKey: Buffer;
        counter: number;
        transports?: string[];
        deviceType: 'singleDevice' | 'multiDevice';
        backedUp: boolean;
        aaguid?: string;
        name: string;
    }): Promise<IPasskeyCredential>;

    findByCredentialId(
        credentialId: string,
    ): Promise<IPasskeyCredential | null>;

    findByUser(userId: string): Promise<IPasskeyCredential[]>;

    findByIdForUser(
        id: string,
        userId: string,
    ): Promise<IPasskeyCredential | null>;

    rename(
        id: string,
        userId: string,
        name: string,
    ): Promise<IPasskeyCredential | null>;

    updateCounter(
        credentialId: string,
        counter: number,
        lastUsedAt: Date,
    ): Promise<void>;

    deleteByIdForUser(
        id: string,
        userId: string,
    ): Promise<IPasskeyCredential | null>;
}
