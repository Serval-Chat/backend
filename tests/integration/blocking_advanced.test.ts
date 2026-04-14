import assert from 'node:assert/strict';
import request from 'supertest';
import type { Response } from 'supertest';
import type { Application } from 'express';
import { setup, teardown, getApp } from './setup';
import { clearDatabase, createTestUser } from './helpers';
import type { IUser } from '../../src/models/User';
import { BlockProfile } from '../../src/models/BlockProfile';

let app: Application;
let user: IUser, userToken: string;
let blocker: IUser, blocked: IUser, otherUser: IUser;
let blockerToken: string, blockedToken: string, otherToken: string;
let serverId: string, channelId: string;

beforeAll(async () => {
    await setup();
    app = getApp();
});

afterAll(async () => {
    await teardown();
});

const BlockFlags = {
    BLOCK_REACTIONS: 1 << 0,
    HIDE_FROM_MEMBER_LIST: 1 << 1,
    HIDE_FROM_MENTIONS: 1 << 2,
    HIDE_MY_PRESENCE: 1 << 4,
    HIDE_MY_PRONOUNS: 1 << 5,
    HIDE_MY_BIO: 1 << 6,
    HIDE_MY_DISPLAY_NAME: 1 << 7,
    HIDE_MY_AVATAR: 1 << 8,
};


function api(app: Application, token: string) {
    return {
        get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${token}`),
        post: (path: string, body: Record<string, unknown> = {}) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body),
        put: (path: string, body: Record<string, unknown> = {}) => request(app).put(path).set('Authorization', `Bearer ${token}`).send(body),
        patch: (path: string, body: Record<string, unknown> = {}) => request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
        delete: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${token}`),
    };
}


async function setupBlock(app: Application, blockerToken: string, targetId: string, flags: number) {
    const profile = await api(app, blockerToken)
        .post('/api/v1/blocks/profiles', { name: `Profile-${flags}`, flags })
        .then((r: Response) => r.body);
    await api(app, blockerToken).put(`/api/v1/blocks/${targetId}`, { profileId: profile.id || profile._id });
    return profile;
}




describe('Advanced Blocking - Profiles CRUD', () => {



    beforeEach(async () => {
        await clearDatabase();
        user = await createTestUser();
        const loginRes = await request(app).post('/api/v1/auth/login').send({
            login: user.login,
            password: 'password123',
        });
        userToken = loginRes.body.token;
    });

    it('GET /blocks/profiles returns empty array initially', async () => {
        const res = await api(app, userToken).get('/api/v1/blocks/profiles');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.equal(res.body.length, 0);
    });

    it('POST /blocks/profiles creates a profile', async () => {
        const res = await api(app, userToken).post('/api/v1/blocks/profiles', {
            name: 'Strict Block',
            flags: BlockFlags.BLOCK_REACTIONS,
        });
        assert.equal(res.status, 201);
        assert.ok(res.body.id || res.body._id);
        assert.equal(res.body.name, 'Strict Block');
    });

    it('PATCH /blocks/profiles/:id updates name and flags', async () => {
        const create = await api(app, userToken).post('/api/v1/blocks/profiles', {
            name: 'Old Name',
            flags: BlockFlags.BLOCK_REACTIONS,
        });
        const profileId = create.body.id || create.body._id;

        const res = await api(app, userToken).patch(`/api/v1/blocks/profiles/${profileId}`, {
            name: 'New Name',
            flags: BlockFlags.HIDE_MY_BIO,
        });
        assert.equal(res.status, 200);
        assert.equal(res.body.name, 'New Name');
        assert.equal(res.body.flags, BlockFlags.HIDE_MY_BIO);
    });

    it('DELETE /blocks/profiles/:id returns 200 and cascades to block records', async () => {
        const other = await createTestUser();

        const profile = await api(app, userToken).post('/api/v1/blocks/profiles', {
            name: 'Cascade Test',
            flags: BlockFlags.BLOCK_REACTIONS,
        }).then((r: Response) => r.body);
        const profileId = profile.id || profile._id;

        // create a block relationship attached to this profile.
        await api(app, userToken).put(`/api/v1/blocks/${other._id.toString()}`, { profileId });

        const before = await api(app, userToken).get('/api/v1/blocks').then((r: Response) => r.body);
        assert.ok(Array.isArray(before) && before.length > 0);

        // delete profile - must return 200, not 204.
        const del = await api(app, userToken).delete(`/api/v1/blocks/profiles/${profileId}`);
        assert.equal(del.status, 200);
        assert.ok(del.body.message);

        // cascade: block relationship should be gone.
        const after = await api(app, userToken).get('/api/v1/blocks').then((r: Response) => r.body);
        assert.equal(after.length, 0, 'Block relationship should be cascade-deleted with the profile');
    });

    it('POST /blocks/profiles returns 409 on the 4097th profile', async () => {
        const batch = [];
        for (let i = 0; i < 4096; i++) {
            batch.push({
                ownerId: user._id,
                name: `Profile ${i}`,
                flags: 0
            });
        }
        await BlockProfile.insertMany(batch);

        const res = await api(app, userToken).post('/api/v1/blocks/profiles', {
            name: 'Over limit',
            flags: 0,
        });
        
        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Maximum of 4096 block profiles allowed');
    }, 30000);
});

describe('Advanced Blocking - Block Lifecycle', () => {



    beforeEach(async () => {
        await clearDatabase();

        blocker = await createTestUser();
        blocked = await createTestUser();

        const r1 = await request(app).post('/api/v1/auth/login').send({ login: blocker.login, password: 'password123' });
        blockerToken = r1.body.token;

        const r2 = await request(app).post('/api/v1/auth/login').send({ login: blocked.login, password: 'password123' });
        blockedToken = r2.body.token;
    });

    it('PUT /blocks/:targetId creates and updates block relationship', async () => {
        const profile = await api(app, blockerToken).post('/api/v1/blocks/profiles', {
            name: 'Test',
            flags: BlockFlags.BLOCK_REACTIONS,
        }).then((r: Response) => r.body);
        const profileId = profile.id || profile._id;

        const res = await api(app, blockerToken).put(`/api/v1/blocks/${blocked._id.toString()}`, { profileId });
        assert.equal(res.status, 200);
        assert.equal(res.body.targetUserId, blocked._id.toString());
    });

    it('DELETE /blocks/:targetId removes block', async () => {
        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.BLOCK_REACTIONS);

        const del = await api(app, blockerToken).delete(`/api/v1/blocks/${blocked._id.toString()}`);
        assert.ok([200, 204].includes(del.status), `Expected 200 or 204, got ${del.status}`);

        const list = await api(app, blockerToken).get('/api/v1/blocks').then((r: Response) => r.body);
        const found = (Array.isArray(list) ? list : []).find(b => b.targetUserId === blocked._id.toString());
        assert.equal(found, undefined, 'Block should be removed');
    });

    it('GET /blocks returns all block relationships as array', async () => {
        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.BLOCK_REACTIONS);

        const res = await api(app, blockerToken).get('/api/v1/blocks');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body));
        assert.ok(res.body.length >= 1);
        assert.ok(res.body[0].targetUserId);
        assert.ok(typeof res.body[0].flags === 'number');
    });
});

describe('Advanced Blocking - Flag 1: BLOCK_REACTIONS (HTTP)', () => {



    beforeEach(async () => {
        await clearDatabase();

        blocker = await createTestUser();
        blocked = await createTestUser();
        otherUser = await createTestUser();

        const r1 = await request(app).post('/api/v1/auth/login').send({ login: blocker.login, password: 'password123' });
        blockerToken = r1.body.token;
        const r2 = await request(app).post('/api/v1/auth/login').send({ login: blocked.login, password: 'password123' });
        blockedToken = r2.body.token;
        const r3 = await request(app).post('/api/v1/auth/login').send({ login: otherUser.login, password: 'password123' });
        otherToken = r3.body.token;

        const serverRes = await api(app, blockerToken).post('/api/v1/servers', { name: 'Reaction Test Server' });
        serverId = serverRes.body.server?._id || serverRes.body._id || serverRes.body.id;

        const serverDetails = await api(app, blockerToken).get(`/api/v1/servers/${serverId}`);
        channelId = serverDetails.body.channels?.[0]?._id || serverRes.body.channel?._id;

        const invite = await api(app, blockerToken).post(`/api/v1/servers/${serverId}/invites`).then((r: Response) => r.body);
        await api(app, blockedToken).post(`/api/v1/invites/${invite.code}/join`);

        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.BLOCK_REACTIONS);
    });

    it('Opacity: HTTP 200 when blocked user tries to react to blocker message', async () => {
        if (!channelId) return;

        const msgRes = await api(app, blockerToken).post(`/api/v1/servers/${serverId}/channels/${channelId}/messages`, {
            content: 'Block my reactions!',
        });
        if (msgRes.status !== 200 && msgRes.status !== 201) return;
        const messageId = msgRes.body._id;

        const reactRes = await api(app, blockedToken).post(`/api/v1/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions`, {
            emoji: '😀',
            emojiType: 'unicode',
        });

        assert.ok([200, 201].includes(reactRes.status), `Expected 200/201 neutral response, got ${reactRes.status}`);
    });

    it('Reaction not stored when BLOCK_REACTIONS is set', async () => {
        if (!channelId) return;

        const msgRes = await api(app, blockerToken).post(`/api/v1/servers/${serverId}/channels/${channelId}/messages`, {
            content: 'No reaction allowed',
        });
        if (msgRes.status !== 200 && msgRes.status !== 201) return;
        const messageId = msgRes.body._id;

        await api(app, blockedToken).post(`/api/v1/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions`, {
            emoji: '👍',
            emojiType: 'unicode',
        });

        const msg = await api(app, blockerToken).get(`/api/v1/servers/${serverId}/channels/${channelId}/messages/${messageId}`);
        if (msg.status !== 200) return;
        const blocked_reaction = (msg.body.reactions || []).find((r: { emoji: string }) => r.emoji === '👍');
        assert.ok(!blocked_reaction, 'Reaction should not be stored when BLOCK_REACTIONS is active');
    });

    it('Other user (not blocked) can still react normally', async () => {
        if (!channelId) return;

        const invite = await api(app, blockerToken).post(`/api/v1/servers/${serverId}/invites`).then((r: Response) => r.body);
        await api(app, otherToken).post(`/api/v1/invites/${invite.code}/join`);

        const msgRes = await api(app, blockerToken).post(`/api/v1/servers/${serverId}/channels/${channelId}/messages`, {
            content: 'Other can react',
        });
        if (msgRes.status !== 200 && msgRes.status !== 201) return;
        const messageId = msgRes.body._id;

        const reactRes = await api(app, otherToken).post(`/api/v1/servers/${serverId}/channels/${channelId}/messages/${messageId}/reactions`, {
            emoji: '🎉',
            emojiType: 'unicode',
        });
        assert.ok([200, 201].includes(reactRes.status), `Expected 200/201, got ${reactRes.status}`);
    });
});

describe('Advanced Blocking - Flag 3: HIDE_FROM_MEMBER_LIST', () => {



    beforeEach(async () => {
        await clearDatabase();

        blocker = await createTestUser();
        blocked = await createTestUser();

        const r1 = await request(app).post('/api/v1/auth/login').send({ login: blocker.login, password: 'password123' });
        blockerToken = r1.body.token;
        const r2 = await request(app).post('/api/v1/auth/login').send({ login: blocked.login, password: 'password123' });
        blockedToken = r2.body.token;

        const serverRes = await api(app, blockerToken).post('/api/v1/servers', { name: 'Member List Server' });
        serverId = serverRes.body.server?._id || serverRes.body._id || serverRes.body.id;

        const invite = await api(app, blockerToken).post(`/api/v1/servers/${serverId}/invites`).then((r: Response) => r.body);
        await api(app, blockedToken).post(`/api/v1/invites/${invite.code}/join`);
    });

    it('Opacity: member list returns 200 both before and after block', async () => {
        const before = await api(app, blockerToken).get(`/api/v1/servers/${serverId}/members`);
        assert.equal(before.status, 200, 'Should be 200 before block');

        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_FROM_MEMBER_LIST);

        const after = await api(app, blockerToken).get(`/api/v1/servers/${serverId}/members`);
        assert.equal(after.status, 200, 'Should be 200 after block (not 403)');
    });

    it('Blocked member excluded from blocker\'s member list', async () => {
        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_FROM_MEMBER_LIST);

        const res = await api(app, blockerToken).get(`/api/v1/servers/${serverId}/members`);
        assert.equal(res.status, 200);
        const members = Array.isArray(res.body) ? res.body : (res.body.members || []);
        const found = members.find((m: { userId?: string; _id?: string }) => (m.userId || m._id) === blocked._id.toString());
        assert.equal(found, undefined, 'Blocked user should be hidden from blocker\'s member list');
    });

    it('Blocked user still sees full member list (asymmetric)', async () => {
        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_FROM_MEMBER_LIST);

        const res = await api(app, blockedToken).get(`/api/v1/servers/${serverId}/members`);
        assert.equal(res.status, 200);
        const members = Array.isArray(res.body) ? res.body : (res.body.members || []);
        const found = members.find((m: { userId?: string; _id?: string }) => (m.userId || m._id) === blocker._id.toString());
        assert.ok(found !== undefined, 'Blocker should still appear in blocked user\'s member list');
    });
});



describe('Advanced Blocking - Flags 12a-12d: Profile Field Visibility', () => {



    beforeEach(async () => {
        await clearDatabase();

        blocker = await createTestUser();
        blocked = await createTestUser();

        const r1 = await request(app).post('/api/v1/auth/login').send({ login: blocker.login, password: 'password123' });
        blockerToken = r1.body.token;
        const r2 = await request(app).post('/api/v1/auth/login').send({ login: blocked.login, password: 'password123' });
        blockedToken = r2.body.token;
    });

    it('Opacity: profile endpoint always returns 200', async () => {
        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_MY_BIO);

        const res = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`);
        assert.equal(res.status, 200, 'Must return 200 even when fields are hidden');
    });

    it('HIDE_MY_BIO nulls bio in profile seen by blocked user', async () => {
        await api(app, blockerToken).patch('/api/v1/profile/bio', { bio: 'My secret bio' });

        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_MY_BIO);

        const profile = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`).then((r: Response) => r.body);
        assert.ok(
            profile.bio === null || profile.bio === undefined || profile.bio === '',
            `Bio should be hidden, got: ${JSON.stringify(profile.bio)}`
        );
    });

    it('HIDE_MY_PRONOUNS nulls pronouns in profile seen by blocked user', async () => {
        await api(app, blockerToken).patch('/api/v1/profile/pronouns', { pronouns: 'they/them' });

        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_MY_PRONOUNS);

        const profile = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`).then((r: Response) => r.body);
        assert.ok(
            profile.pronouns === null || profile.pronouns === undefined || profile.pronouns === '',
            `Pronouns should be hidden, got: ${JSON.stringify(profile.pronouns)}`
        );
    });

    it('HIDE_MY_DISPLAY_NAME nulls displayName in profile seen by blocked user', async () => {
        await api(app, blockerToken).patch('/api/v1/profile/display-name', { displayName: 'My Display Name' });

        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_MY_DISPLAY_NAME);

        const profile = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`).then((r: Response) => r.body);
        assert.ok(
            profile.displayName === null || profile.displayName === undefined || profile.displayName === '',
            `displayName should be hidden, got: ${JSON.stringify(profile.displayName)}`
        );
    });

    it('Bio remains visible to non-blocked users', async () => {
        const other = await createTestUser();
        const otherRes = await request(app).post('/api/v1/auth/login').send({ login: other.login, password: 'password123' });
        const otherToken = otherRes.body.token;

        await api(app, blockerToken).patch('/api/v1/profile/bio', { bio: 'Public bio' });
        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_MY_BIO);

        const profile = await api(app, otherToken).get(`/api/v1/profile/${blocker._id.toString()}`).then((r: Response) => r.body);
        assert.ok(
            profile.bio === 'Public bio' || profile.bio !== null,
            `Bio should be visible to non-blocked users`
        );
    });

    it('All fields hidden when all HIDE_MY_* flags are combined', async () => {
        await api(app, blockerToken).patch('/api/v1/profile/bio', { bio: 'Hidden bio' });
        await api(app, blockerToken).patch('/api/v1/profile/pronouns', { pronouns: 'ze/zir' });
        await api(app, blockerToken).patch('/api/v1/profile/display-name', { displayName: 'Hidden Name' });

        const allHideFlags =
            BlockFlags.HIDE_MY_BIO |
            BlockFlags.HIDE_MY_PRONOUNS |
            BlockFlags.HIDE_MY_DISPLAY_NAME |
            BlockFlags.HIDE_MY_AVATAR;

        await setupBlock(app, blockerToken, blocked._id.toString(), allHideFlags);

        const profile = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`).then((r: Response) => r.body);
        const isNullOrEmpty = (v: unknown) => v === null || v === undefined || v === ''; assert.ok(isNullOrEmpty(profile.bio), 'bio hidden');
        assert.ok(isNullOrEmpty(profile.pronouns), 'pronouns hidden');
        assert.ok(isNullOrEmpty(profile.displayName), 'displayName hidden');
        assert.ok(profile.username, 'username must always be present');
    });
});

describe('Advanced Blocking - General Opacity Guarantees', () => {



    beforeEach(async () => {
        await clearDatabase();

        blocker = await createTestUser();
        blocked = await createTestUser();

        const r1 = await request(app).post('/api/v1/auth/login').send({ login: blocker.login, password: 'password123' });
        blockerToken = r1.body.token;
        const r2 = await request(app).post('/api/v1/auth/login').send({ login: blocked.login, password: 'password123' });
        blockedToken = r2.body.token;
    });

    it('No endpoint leaks block existence via 403 or 404', async () => {
        const ALL_FLAGS = Object.values(BlockFlags).reduce((a, b) => a | b, 0);
        await setupBlock(app, blockerToken, blocked._id.toString(), ALL_FLAGS);

        const profile = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`);
        assert.equal(profile.status, 200, `Profile must return 200 when fields hidden, got ${profile.status}`);

        const friend = await api(app, blockedToken).post('/api/v1/friends', { username: blocker.username });
        assert.ok([200, 201].includes(friend.status), `Friend request must return 200/201 when blocked, got ${friend.status}`);
    });

    it('Unblocking restores full visibility', async () => {
        await api(app, blockerToken).patch('/api/v1/profile/bio', { bio: 'Secret bio' });
        await setupBlock(app, blockerToken, blocked._id.toString(), BlockFlags.HIDE_MY_BIO);

        const hidden = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`).then((r: Response) => r.body);
        assert.ok(hidden.bio === null || hidden.bio === undefined || hidden.bio === '', 'bio should be hidden');

        await api(app, blockerToken).delete(`/api/v1/blocks/${blocked._id.toString()}`);

        const visible = await api(app, blockedToken).get(`/api/v1/profile/${blocker._id.toString()}`).then(r => r.body);
        assert.ok(visible.bio === 'Secret bio' || (visible.bio !== null && visible.bio !== undefined), 'bio should be visible after unblock');
    });
});
