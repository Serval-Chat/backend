const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { setup, teardown } = require('./setup.cjs');
const { 
    createTestUser, 
    generateAuthToken, 
    clearDatabase,
    createTestServer
} = require('./helpers.cjs');

test.describe('Server Settings API', () => {
    let app;
    let server;
    let user;
    let token;
    let server1;
    let server2;

    test.before(async () => {
        const result = await setup();
        app = result.app;
        server = result.server;
        await clearDatabase();
        user = await createTestUser();
        token = generateAuthToken(user);
        server1 = await createTestServer(user._id);
        server2 = await createTestServer(user._id);
    });

    test.after(async () => {
        await teardown();
    });

    test('PATCH /api/v1/settings/server-settings updates order', async () => {
        const newOrder = [
            server2._id.toString(),
            {
                id: 'folder1',
                name: 'Work',
                color: '#ff0000',
                serverIds: [server1._id.toString()]
            }
        ];

        const response = await request(app)
            .patch('/api/v1/settings/server-settings')
            .set('Authorization', `Bearer ${token}`)
            .send({ order: newOrder });

        assert.strictEqual(response.status, 200);
        assert.deepStrictEqual(response.body.serverSettings.order, newOrder);

        const getResponse = await request(app)
            .get('/api/v1/settings')
            .set('Authorization', `Bearer ${token}`);
        
        assert.strictEqual(getResponse.status, 200);
        assert.deepStrictEqual(getResponse.body.serverSettings.order, newOrder);
    });

    test('GET /api/v1/profile/me includes serverSettings', async () => {
        const response = await request(app)
            .get('/api/v1/profile/me')
            .set('Authorization', `Bearer ${token}`);

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.serverSettings);
        assert.ok(Array.isArray(response.body.serverSettings.order));
    });
});
