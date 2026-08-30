import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { MongoosePasskeyCredentialRepository } from './MongoosePasskeyCredentialRepository';

let mongod: MongoMemoryServer;
let repo: MongoosePasskeyCredentialRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongoosePasskeyCredentialRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

const createCredential = (
    overrides: Partial<Parameters<typeof repo.create>[0]> = {},
) =>
    repo.create({
        userId: 'user-1',
        credentialId: `cred_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        publicKey: Buffer.from('public-key'),
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'Test Passkey',
        ...overrides,
    });

describe('MongoosePasskeyCredentialRepository', () => {
    it('creates a credential and round-trips all fields', async () => {
        const created = await createCredential({
            transports: ['internal'],
            aaguid: 'aaguid-1',
        });

        const found = await repo.findByCredentialId(created.credentialId);
        expect(found).not.toBeNull();
        expect(found?.userId).toBe('user-1');
        expect(found?.publicKey.toString()).toBe('public-key');
        expect(found?.counter).toBe(0);
        expect(found?.transports).toEqual(['internal']);
        expect(found?.deviceType).toBe('singleDevice');
        expect(found?.backedUp).toBe(false);
        expect(found?.aaguid).toBe('aaguid-1');
        expect(found?.name).toBe('Test Passkey');
        expect(found?.lastUsedAt).toBeNull();
    });

    it('rejects a duplicate credentialId', async () => {
        const dupeId = `cred_dupe_${Date.now()}`;
        await createCredential({ credentialId: dupeId });

        await expect(
            createCredential({ credentialId: dupeId }),
        ).rejects.toThrow();
    });

    it('scopes findByUser to the given user only', async () => {
        const userId = `user_${Date.now()}`;
        await createCredential({ userId });
        await createCredential({ userId });
        await createCredential({ userId: `${userId}_other` });

        const found = await repo.findByUser(userId);
        expect(found).toHaveLength(2);
        expect(found.every((c) => c.userId === userId)).toBe(true);
    });

    it('findByIdForUser returns null when the credential belongs to someone else', async () => {
        const created = await createCredential({ userId: 'owner' });

        expect(
            await repo.findByIdForUser(created.snowflakeId, 'not-the-owner'),
        ).toBeNull();
        expect(
            await repo.findByIdForUser(created.snowflakeId, 'owner'),
        ).not.toBeNull();
    });

    it('rename no-ops when the caller does not own the credential', async () => {
        const created = await createCredential({ userId: 'owner' });

        expect(
            await repo.rename(created.snowflakeId, 'not-the-owner', 'New name'),
        ).toBeNull();

        const renamed = await repo.rename(
            created.snowflakeId,
            'owner',
            'New name',
        );
        expect(renamed?.name).toBe('New name');
    });

    it('deleteByIdForUser no-ops when the caller does not own the credential', async () => {
        const created = await createCredential({ userId: 'owner' });

        expect(
            await repo.deleteByIdForUser(created.snowflakeId, 'not-the-owner'),
        ).toBeNull();
        expect(
            await repo.findByCredentialId(created.credentialId),
        ).not.toBeNull();

        expect(
            await repo.deleteByIdForUser(created.snowflakeId, 'owner'),
        ).not.toBeNull();
        expect(await repo.findByCredentialId(created.credentialId)).toBeNull();
    });

    it('updateCounter persists the new counter and lastUsedAt', async () => {
        const created = await createCredential();
        const lastUsedAt = new Date();

        await repo.updateCounter(created.credentialId, 42, lastUsedAt);

        const found = await repo.findByCredentialId(created.credentialId);
        expect(found?.counter).toBe(42);
        expect(found?.lastUsedAt?.getTime()).toBe(lastUsedAt.getTime());
    });
});
