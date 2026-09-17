import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';

import { ServerMember } from '@/models/Server';
import { User } from '@/models/User';

import { MongooseServerMemberRepository } from './MongooseServerMemberRepository';

let mongod: MongoMemoryServer;
let repo: MongooseServerMemberRepository;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    repo = new MongooseServerMemberRepository();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

afterEach(async () => {
    await ServerMember.deleteMany({});
    await User.deleteMany({});
});

const createUser = (overrides: Record<string, unknown> = {}) =>
    User.create({
        username: `user_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        login: `login_${Date.now()}_${Math.floor(Math.random() * 100000)}@example.com`,
        password: 'password123',
        ...overrides,
    });

describe('MongooseServerMemberRepository.create', () => {
    test('persists joinedVia when provided', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const user = await createUser();

        const member = await repo.create({
            serverId,
            userId: user.snowflakeId,
            roles: [],
            joinedVia: { method: 'invite', code: 'abc123' },
        });

        expect(member.joinedVia).toEqual({
            method: 'invite',
            code: 'abc123',
        });

        const persisted = await ServerMember.findOne({
            serverId,
            userId: user.snowflakeId,
        }).lean();
        expect(persisted?.joinedVia).toEqual({
            method: 'invite',
            code: 'abc123',
        });
    });

    test('leaves joinedVia unset when omitted', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const user = await createUser();

        const member = await repo.create({
            serverId,
            userId: user.snowflakeId,
            roles: [],
        });

        expect(member.joinedVia).toBeUndefined();
    });
});

describe('MongooseServerMemberRepository.findByServerIdFiltered', () => {
    test('filters by role and reports the filtered total, not the full roster', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const roleId = 'role-1';
        const userWithRole = await createUser();
        const userWithoutRole = await createUser();

        await repo.create({
            serverId,
            userId: userWithRole.snowflakeId,
            roles: [roleId],
        });
        await repo.create({
            serverId,
            userId: userWithoutRole.snowflakeId,
            roles: [],
        });

        const result = await repo.findByServerIdFiltered(serverId, {
            roleId,
            limit: 10,
            offset: 0,
        });

        expect(result.total).toBe(1);
        expect(result.members).toHaveLength(1);
        expect(result.members[0]?.userId).toBe(userWithRole.snowflakeId);
    });

    test('search matches on username and displayName, case-insensitively', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const matchByUsername = await createUser({ username: 'zephyrfox' });
        const matchByDisplayName = await createUser({
            displayName: 'Cosmic Otter',
        });
        const noMatch = await createUser({
            username: 'unrelated',
            displayName: 'Someone Else',
        });

        await repo.create({
            serverId,
            userId: matchByUsername.snowflakeId,
            roles: [],
        });
        await repo.create({
            serverId,
            userId: matchByDisplayName.snowflakeId,
            roles: [],
        });
        await repo.create({
            serverId,
            userId: noMatch.snowflakeId,
            roles: [],
        });

        const byUsername = await repo.findByServerIdFiltered(serverId, {
            search: 'ZEPHYR',
            limit: 10,
            offset: 0,
        });
        expect(byUsername.total).toBe(1);
        expect(byUsername.members[0]?.userId).toBe(matchByUsername.snowflakeId);

        const byDisplayName = await repo.findByServerIdFiltered(serverId, {
            search: 'cosmic',
            limit: 10,
            offset: 0,
        });
        expect(byDisplayName.total).toBe(1);
        expect(byDisplayName.members[0]?.userId).toBe(
            matchByDisplayName.snowflakeId,
        );
    });

    test('combines role filter and search with AND semantics', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const roleId = 'role-1';
        const matches = await createUser({ username: 'griffinmatch' });
        const wrongRole = await createUser({ username: 'griffinnorole' });

        await repo.create({
            serverId,
            userId: matches.snowflakeId,
            roles: [roleId],
        });
        await repo.create({
            serverId,
            userId: wrongRole.snowflakeId,
            roles: [],
        });

        const result = await repo.findByServerIdFiltered(serverId, {
            roleId,
            search: 'griffin',
            limit: 10,
            offset: 0,
        });

        expect(result.total).toBe(1);
        expect(result.members[0]?.userId).toBe(matches.snowflakeId);
    });

    test('sorts by joinedAt ascending and descending', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const older = await createUser();
        const newer = await createUser();

        const olderMember = await repo.create({
            serverId,
            userId: older.snowflakeId,
            roles: [],
        });
        await ServerMember.updateOne(
            { snowflakeId: olderMember.snowflakeId },
            { joinedAt: new Date('2020-01-01') },
        );
        const newerMember = await repo.create({
            serverId,
            userId: newer.snowflakeId,
            roles: [],
        });
        await ServerMember.updateOne(
            { snowflakeId: newerMember.snowflakeId },
            { joinedAt: new Date('2024-01-01') },
        );

        const ascending = await repo.findByServerIdFiltered(serverId, {
            sortBy: 'joinedAt',
            sortDir: 'asc',
            limit: 10,
            offset: 0,
        });
        expect(ascending.members.map((m) => m.userId)).toEqual([
            older.snowflakeId,
            newer.snowflakeId,
        ]);

        const descending = await repo.findByServerIdFiltered(serverId, {
            sortBy: 'joinedAt',
            sortDir: 'desc',
            limit: 10,
            offset: 0,
        });
        expect(descending.members.map((m) => m.userId)).toEqual([
            newer.snowflakeId,
            older.snowflakeId,
        ]);
    });

    test('paginates with limit/offset while total reflects the full filtered count', async () => {
        const serverId = new Types.ObjectId().toHexString();
        for (let i = 0; i < 5; i++) {
            const user = await createUser();
            await repo.create({
                serverId,
                userId: user.snowflakeId,
                roles: [],
            });
        }

        const page1 = await repo.findByServerIdFiltered(serverId, {
            limit: 2,
            offset: 0,
        });
        const page2 = await repo.findByServerIdFiltered(serverId, {
            limit: 2,
            offset: 2,
        });

        expect(page1.total).toBe(5);
        expect(page1.members).toHaveLength(2);
        expect(page2.total).toBe(5);
        expect(page2.members).toHaveLength(2);
    });

    test('includes a member with no matching User doc, with user: null', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const missingUserId = new Types.ObjectId().toHexString();

        await repo.create({
            serverId,
            userId: missingUserId,
            roles: [],
        });

        const result = await repo.findByServerIdFiltered(serverId, {
            limit: 10,
            offset: 0,
        });

        expect(result.total).toBe(1);
        expect(result.members[0]?.user).toBeNull();
    });

    test('never exposes password/permissions/settings/login/language/deletedReason on the joined user', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const user = await createUser({
            password: 'super-secret-hash',
            login: 'secret-login@example.com',
            permissions: { isAdmin: true },
            settings: { muteNotifications: true },
            language: 'en',
            deletedReason: 'test-only',
        });

        await repo.create({
            serverId,
            userId: user.snowflakeId,
            roles: [],
        });

        const result = await repo.findByServerIdFiltered(serverId, {
            limit: 10,
            offset: 0,
        });

        const returnedUser = result.members[0]?.user as unknown as Record<
            string,
            unknown
        >;
        expect(returnedUser).not.toBeNull();
        expect(returnedUser).not.toHaveProperty('password');
        expect(returnedUser).not.toHaveProperty('permissions');
        expect(returnedUser).not.toHaveProperty('settings');
        expect(returnedUser).not.toHaveProperty('login');
        expect(returnedUser).not.toHaveProperty('language');
        expect(returnedUser).not.toHaveProperty('deletedReason');
    });
});

const SENSITIVE_FIELDS = [
    'password',
    'permissions',
    'settings',
    'login',
    'language',
    'deletedReason',
] as const;

const expectNoSensitiveFields = (user: unknown): void => {
    const returnedUser = user as Record<string, unknown>;
    expect(returnedUser).not.toBeNull();
    for (const field of SENSITIVE_FIELDS) {
        expect(returnedUser).not.toHaveProperty(field);
    }
};

describe('MongooseServerMemberRepository.findByServerIdWithUserInfo', () => {
    test('never exposes password/permissions/settings/login/language/deletedReason on the joined user', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const user = await createUser({
            password: 'super-secret-hash',
            login: 'secret-login@example.com',
            permissions: { isAdmin: true },
            settings: { muteNotifications: true },
            language: 'en',
            deletedReason: 'test-only',
        });

        await repo.create({ serverId, userId: user.snowflakeId, roles: [] });

        const [member] = await repo.findByServerIdWithUserInfo(serverId);

        expectNoSensitiveFields(member?.user);
    });

    test('returns user: null when the member has no matching User doc', async () => {
        const serverId = new Types.ObjectId().toHexString();
        await repo.create({
            serverId,
            userId: new Types.ObjectId().toHexString(),
            roles: [],
        });

        const [member] = await repo.findByServerIdWithUserInfo(serverId);

        expect(member?.user).toBeNull();
    });
});

describe('MongooseServerMemberRepository.searchMembers', () => {
    test('never exposes password/permissions/settings/login/language/deletedReason on matched users', async () => {
        const serverId = new Types.ObjectId().toHexString();
        const user = await createUser({
            username: 'searchtarget',
            password: 'super-secret-hash',
            login: 'secret-login@example.com',
            permissions: { isAdmin: true },
            settings: { muteNotifications: true },
            language: 'en',
            deletedReason: 'test-only',
        });

        await repo.create({ serverId, userId: user.snowflakeId, roles: [] });

        const [member] = await repo.searchMembers(serverId, 'searchtarget');

        expectNoSensitiveFields(member?.user);
    });
});
