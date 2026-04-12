require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractClientIp } = require('../../src/utils/ip');

test('extractClientIp - extracts CF-Connecting-IP', () => {
    const req = {
        headers: { 'cf-connecting-ip': '1.2.3.4' },
        socket: {}
    };
    assert.strictEqual(extractClientIp(req), '1.2.3.4');
});

test('extractClientIp - extracts first IP from CF-Connecting-IP array', () => {
    const req = {
        headers: { 'cf-connecting-ip': ['1.2.3.4', '5.6.7.8'] },
        socket: {}
    };
    assert.strictEqual(extractClientIp(req), '1.2.3.4');
});

test('extractClientIp - extracts X-Forwarded-For', () => {
    const req = {
        headers: { 'x-forwarded-for': '2.3.4.5, 6.7.8.9' },
        socket: {}
    };
    assert.strictEqual(extractClientIp(req), '2.3.4.5');
});

test('extractClientIp - extracts first IP from X-Forwarded-For array', () => {
    const req = {
        headers: { 'x-forwarded-for': ['2.3.4.5', '6.7.8.9'] },
        socket: {}
    };
    assert.strictEqual(extractClientIp(req), '2.3.4.5');
});

test('extractClientIp - extracts X-Real-IP', () => {
    const req = {
        headers: { 'x-real-ip': '3.4.5.6' },
        socket: {}
    };
    assert.strictEqual(extractClientIp(req), '3.4.5.6');
});

test('extractClientIp - extracts req.ip', () => {
    const req = {
        headers: {},
        ip: '4.5.6.7',
        socket: {}
    };
    assert.strictEqual(extractClientIp(req), '4.5.6.7');
});

test('extractClientIp - extracts socket.remoteAddress', () => {
    const req = {
        headers: {},
        socket: { remoteAddress: '5.6.7.8' }
    };
    assert.strictEqual(extractClientIp(req), '5.6.7.8');
});

test('extractClientIp - returns unknown if no IP found', () => {
    const req = {
        headers: {},
        socket: {}
    };
    assert.strictEqual(extractClientIp(req), 'unknown');
});

test('extractClientIp - handles empty arrays in headers', () => {
    const req = {
        headers: {
            'cf-connecting-ip': [],
            'x-forwarded-for': [],
            'x-real-ip': []
        },
        socket: { remoteAddress: '6.7.8.9' }
    };
    assert.strictEqual(extractClientIp(req), '6.7.8.9');
});
