require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');

const {
    default: fileProxyRouter,
    __proxyTestUtils,
} = require('../src/routes/api/v1/fileProxy');

const app = express();
app.use('/api/v1', fileProxyRouter);

const originalDispatcher = getGlobalDispatcher();
const mockAgent = new MockAgent();
mockAgent.disableNetConnect();
setGlobalDispatcher(mockAgent);

test.after(async () => {
    await mockAgent.close();
    setGlobalDispatcher(originalDispatcher);
});

test.beforeEach(() => {
    __proxyTestUtils.clearCaches();
});

test.afterEach(() => {
    mockAgent.assertNoPendingInterceptors();
});

test('proxies successful downloads and returns buffered response', async () => {
    const scope = mockAgent.get('https://files.example.com');
    scope
        .intercept({ path: '/hello.txt', method: 'GET' })
        .reply(200, 'hello world', {
            headers: {
                'content-type': 'text/plain',
                'content-length': '11',
            },
        });

    const res = await request(app)
        .get('/api/v1/file-proxy')
        .query({ url: 'https://files.example.com/hello.txt' })
        .expect(200);

    assert.equal(res.text, 'hello world');
    assert.equal(res.headers['content-type'], 'text/plain');
    assert.equal(res.headers['content-length'], '11');
});

test('serves cached responses without refetching upstream', async () => {
    const scope = mockAgent.get('https://files.example.com');
    scope
        .intercept({ path: '/cached.txt', method: 'GET' })
        .reply(200, 'cached-body', {
            headers: {
                'content-type': 'text/plain',
            },
        });

    const url = 'https://files.example.com/cached.txt';
    const first = await request(app)
        .get('/api/v1/file-proxy')
        .query({ url })
        .expect(200);

    assert.equal(first.text, 'cached-body');

    // Second request should be served from cache; no additional intercept required.
    const second = await request(app)
        .get('/api/v1/file-proxy')
        .query({ url })
        .expect(200);

    assert.equal(second.text, 'cached-body');
});

test('returns metadata via HEAD proxy endpoint', async () => {
    const scope = mockAgent.get('https://files.example.com');
    scope
        .intercept({ path: '/binary.bin', method: 'HEAD' })
        .reply(200, '', {
            headers: {
                'content-length': '1234',
                'content-type': 'application/octet-stream',
            },
        });

    const res = await request(app)
        .get('/api/v1/file-proxy/meta')
        .query({ url: 'https://files.example.com/binary.bin' })
        .expect(200);

    assert.equal(res.body.status, 200);
    assert.equal(res.body.size, 1234);
    assert.equal(res.body.headers['content-type'], 'application/octet-stream');
});

test('enforces maximum file size based on upstream header', async () => {
    const scope = mockAgent.get('https://files.example.com');
    scope
        .intercept({ path: '/too-large.bin', method: 'GET' })
        .reply(200, 'oversize', {
            headers: {
                'content-length': String(16 * 1024 * 1024),
            },
        });

    const res = await request(app)
        .get('/api/v1/file-proxy')
        .query({ url: 'https://files.example.com/too-large.bin' })
        .expect(413);

    assert.equal(res.body.error, 'File size exceeds 15MB limit');
});
