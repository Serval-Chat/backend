/**
 * Admin Invites Batch Integration Tests
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken } = require('./helpers.cjs');

describe('Admin Invites Batch Integration Tests', () => {
    let app;
    let adminUser;
    let adminToken;
    const TOKENS_FILE = path.join(process.cwd(), 'tokens.txt');
    let originalTokensExist = false;
    let originalTokensContent = '';

    before(async () => {
        if (fs.existsSync(TOKENS_FILE)) {
            originalTokensExist = true;
            originalTokensContent = fs.readFileSync(TOKENS_FILE, 'utf-8');
        }

        await setup();
        app = getApp();
        await clearDatabase();

        adminUser = await createTestUser({
            permissions: { adminAccess: true, manageInvites: true }
        });
        adminToken = generateAuthToken(adminUser);
    });

    after(async () => {
        await teardown();

        if (originalTokensExist) {
            fs.writeFileSync(TOKENS_FILE, originalTokensContent);
        } else if (fs.existsSync(TOKENS_FILE)) {
            fs.unlinkSync(TOKENS_FILE);
        }
    });

    test('POST /api/v1/admin/invites should create a single invite', async () => {
        const res = await request(app)
            .post('/api/v1/admin/invites')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.equal(res.status, 200);
        assert.ok(res.body.token, 'Should return a token');
        
        const tokens = fs.readFileSync(TOKENS_FILE, 'utf-8').split('\n').filter(Boolean);
        assert.ok(tokens.includes(res.body.token), 'Token should be in tokens.txt');
    });

    test('POST /api/v1/admin/invites/batch should create multiple invites', async () => {
        const batchSize = 5;
        const res = await request(app)
            .post('/api/v1/admin/invites/batch')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ count: batchSize });

        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.tokens), 'Should return an array of tokens');
        assert.equal(res.body.tokens.length, batchSize);
        
        const fileContent = fs.readFileSync(TOKENS_FILE, 'utf-8');
        res.body.tokens.forEach(token => {
            assert.ok(fileContent.includes(token), `Token ${token} should be in tokens.txt`);
        });
    });

    test('POST /api/v1/admin/invites/batch with invalid count should fail', async () => {
        const res = await request(app)
            .post('/api/v1/admin/invites/batch')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ count: -1 });

        assert.equal(res.status, 400);
        assert.ok(res.body.error);
    });

    test('GET /api/v1/admin/invites/export should download the file', async () => {
        const res = await request(app)
            .get('/api/v1/admin/invites/export')
            .set('Authorization', `Bearer ${adminToken}`);

        assert.equal(res.status, 200);
        assert.equal(res.header['content-disposition'], 'attachment; filename="invites.txt"');
        assert.ok(res.text.length > 0, 'Exported content should not be empty');
        
        const tokensInFile = fs.readFileSync(TOKENS_FILE, 'utf-8');
        assert.equal(res.text, tokensInFile);
    });
});
