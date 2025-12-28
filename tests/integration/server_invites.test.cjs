/**
 * Server Invites Integration Tests
 * 
 * Tests server invite system:
 * - Creating invites with custom codes
 * - Creating invites with maxUses
 * - Creating invites with expiresIn
 * - Getting server invites
 * - Deleting invites
 * - Getting invite details
 * - Joining servers via invites
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken, createTestServer } = require('./helpers.cjs');
const { ServerMember } = require('../../src/models/Server');

describe('Server Invites Integration Tests', () => {
    let app;

    before(async () => {
        await setup();
        app = getApp();
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
    });

    describe('POST /api/v1/servers/:serverId/invites', () => {
        test('should create invite with customPath field', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            // Add owner as member with manageInvites permission
            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customPath: 'testcustom',
                    maxUses: 5
                });

            console.log('Response status:', res.status);
            console.log('Response body:', res.body);

            // This should succeed (200) but currently fails with 400
            assert.equal(res.status, 200, `Expected 200 but got ${res.status}: ${JSON.stringify(res.body)}`);
            assert.ok(res.body.code);
            assert.equal(res.body.code, 'testcustom');
            assert.equal(res.body.maxUses, 5);
        });

        test('should create invite with maxUses only', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    maxUses: 10
                });

            assert.equal(res.status, 200);
            assert.ok(res.body.code);
            assert.equal(res.body.maxUses, 10);
            // Code should be auto-generated (8 character hex)
            assert.equal(res.body.code.length, 8);
        });

        test('should create invite with expiresIn', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    expiresIn: 3600 // 1 hour in seconds
                });

            assert.equal(res.status, 200);
            assert.ok(res.body.code);
            assert.ok(res.body.expiresAt);

            // Verify expiration is roughly 1 hour from now
            const expiresAt = new Date(res.body.expiresAt);
            const expectedExpiry = new Date(Date.now() + 3600 * 1000);
            const diff = Math.abs(expiresAt - expectedExpiry);
            assert.ok(diff < 5000, 'Expiry time should be within 5 seconds of expected');
        });

        test('should create invite with no parameters (defaults)', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({});

            assert.equal(res.status, 200);
            assert.ok(res.body.code);
            assert.equal(res.body.maxUses, 0); // 0 = unlimited
            assert.equal(res.body.code.length, 8); // Auto-generated
        });

        test('should fail with customPath if not server owner', async () => {
            const owner = await createTestUser();
            const member = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(member);

            // Give member manageInvites permission via role
            const { Role } = require('../../src/models/Server');
            const role = await Role.create({
                serverId: server._id,
                name: 'Moderator',
                position: 1,
                permissions: {
                    manageInvites: true
                }
            });

            await ServerMember.create({
                serverId: server._id,
                userId: member._id,
                roleIds: [role._id],
                joinedAt: new Date(),
            });

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customPath: 'testcustom'
                });

            assert.equal(res.status, 403);
        });

        test('should fail if user lacks manageInvites permission', async () => {
            const owner = await createTestUser();
            const member = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(member);

            await ServerMember.create({
                serverId: server._id,
                userId: member._id,
                joinedAt: new Date(),
            });

            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    maxUses: 5
                });

            assert.equal(res.status, 403);
        });

        test('should fail if customPath already exists', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            // Create first invite
            await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customPath: 'duplicate'
                });

            // Try to create second invite with same code
            const res = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    customPath: 'duplicate'
                });

            assert.equal(res.status, 400);
        });
    });

    describe('GET /api/v1/servers/:serverId/invites', () => {
        test('should list all server invites', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            // Create multiple invites
            const invite1 = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({ maxUses: 5 });
            if (invite1.status !== 200) console.log('List invites setup failed 1:', invite1.status, invite1.body);

            const invite2 = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({ maxUses: 10 });
            if (invite2.status !== 200) console.log('List invites setup failed 2:', invite2.status, invite2.body);

            const res = await request(app)
                .get(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body));
            assert.equal(res.body.length, 2);
        });

        test('should fail if user lacks manageInvites permission', async () => {
            const owner = await createTestUser();
            const member = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(member);

            await ServerMember.create({
                serverId: server._id,
                userId: member._id,
                joinedAt: new Date(),
            });

            const res = await request(app)
                .get(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 403);
        });
    });

    describe('DELETE /api/v1/servers/:serverId/invites/:inviteId', () => {
        test('should delete an invite', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            // Create invite
            const createRes = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({ maxUses: 5 });

            const inviteId = createRes.body._id;

            // Delete invite
            const res = await request(app)
                .delete(`/api/v1/servers/${server._id}/invites/${inviteId}`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(res.status, 200);

            // Verify it's deleted
            const listRes = await request(app)
                .get(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`);

            assert.equal(listRes.body.length, 0);
        });
    });

    describe('GET /api/v1/invites/:code', () => {
        test('should get invite details', async () => {
            const owner = await createTestUser();
            const server = await createTestServer(owner._id);
            const token = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            // Create invite
            const createRes = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${token}`)
                .send({ customPath: 'details123' });

            // Get invite details (no auth required)
            const res = await request(app)
                .get('/api/v1/invites/details123');

            assert.equal(res.status, 200);
            assert.ok(res.body.server);
            assert.equal(res.body.server.name, server.name);
        });

        test('should return 404 for non-existent invite', async () => {
            const res = await request(app)
                .get('/api/v1/invites/nonexistent');

            assert.equal(res.status, 404);
        });
    });

    describe('POST /api/v1/invites/:code/join', () => {
        test('should join server via invite', async () => {
            const owner = await createTestUser();
            const joiner = await createTestUser();
            const server = await createTestServer(owner._id);
            const ownerToken = generateAuthToken(owner);
            const joinerToken = generateAuthToken(joiner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            // Create invite
            const createRes = await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({ customPath: 'join123' });

            if (createRes.status !== 200) console.log('Join invite creation failed:', createRes.status, createRes.body);

            // Join server
            const res = await request(app)
                .post('/api/v1/invites/join123/join')
                .set('Authorization', `Bearer ${joinerToken}`);

            assert.equal(res.status, 200);
            assert.equal(res.body.serverId, server._id.toString());

            // Verify member was added
            const member = await ServerMember.findOne({
                serverId: server._id,
                userId: joiner._id
            });
            assert.ok(member);
        });

        test('should increment invite uses on join', async () => {
            const owner = await createTestUser();
            const joiner = await createTestUser();
            const server = await createTestServer(owner._id);
            const ownerToken = generateAuthToken(owner);
            const joinerToken = generateAuthToken(joiner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            // Create invite with maxUses
            await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({
                    customPath: 'limited123',
                    maxUses: 2
                });

            // Join server
            await request(app)
                .post('/api/v1/invites/limited123/join')
                .set('Authorization', `Bearer ${joinerToken}`);

            // Check invite uses
            const { Invite } = require('../../src/models/Server');
            const invite = await Invite.findOne({ code: 'limited123' });
            assert.equal(invite.uses, 1);
        });

        test('should fail if invite max uses exceeded', async () => {
            const owner = await createTestUser();
            const joiner1 = await createTestUser();
            const joiner2 = await createTestUser();
            const server = await createTestServer(owner._id);
            const ownerToken = generateAuthToken(owner);

            await ServerMember.create({
                serverId: server._id,
                userId: owner._id,
                joinedAt: new Date(),
            });

            // Create invite with maxUses = 1
            await request(app)
                .post(`/api/v1/servers/${server._id}/invites`)
                .set('Authorization', `Bearer ${ownerToken}`)
                .send({
                    customPath: 'onceonly',
                    maxUses: 1
                });

            // First join should succeed
            await request(app)
                .post('/api/v1/invites/onceonly/join')
                .set('Authorization', `Bearer ${generateAuthToken(joiner1)}`);

            // Second join should fail
            const res = await request(app)
                .post('/api/v1/invites/onceonly/join')
                .set('Authorization', `Bearer ${generateAuthToken(joiner2)}`);

            assert.ok(res.status >= 400);
        });
    });
});
