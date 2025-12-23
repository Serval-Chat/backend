const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { setup, teardown, getApp } = require('./setup.cjs');

describe('File Compatibility Integration Tests', () => {
    let app;
    const uploadsDir = path.join(process.cwd(), 'uploads', 'uploads');
    const testFilename = 'test-file-compatibility.txt';
    const testFilePath = path.join(uploadsDir, testFilename);
    const testContent = 'Hello, this is a compatibility test file.';

    before(async () => {
        await setup();
        app = getApp();

        // Ensure uploads directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Create a test file
        fs.writeFileSync(testFilePath, testContent);
    });

    after(async () => {
        await teardown();
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    test('GET /api/v1/download/:filename - should download file from legacy endpoint', async () => {
        const res = await request(app)
            .get(`/api/v1/download/${testFilename}`)
            .expect(200);

        assert.equal(res.text, testContent);
        assert.equal(res.headers['content-type'], 'text/plain');
        assert.ok(res.headers['content-disposition'].includes(testFilename));
    });

    test('GET /api/v1/files/download/:filename - should still work for current endpoint', async () => {
        const res = await request(app)
            .get(`/api/v1/files/download/${testFilename}`)
            .expect(200);

        assert.equal(res.text, testContent);
        assert.equal(res.headers['content-type'], 'text/plain');
        assert.ok(res.headers['content-disposition'].includes(testFilename));
    });

    test('GET /api/v1/download/:filename - should return 404 for non-existent file', async () => {
        const res = await request(app)
            .get('/api/v1/download/non-existent-file.txt')
            .expect(404);

        assert.ok(res.body.error);
    });

    test('GET /api/v1/download/:filename - should prevent directory traversal', async () => {
        const res = await request(app)
            .get('/api/v1/download/..%2Fpackage.json')
            .expect(400);

        assert.ok(res.body.error);
    });
});
