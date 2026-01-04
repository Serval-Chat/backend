import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { discordCrawlerPreview } from '../../src/middleware/crawlerPreview';
import { container } from '../../src/di/container';
import { TYPES } from '../../src/di/types';

describe('discordCrawlerPreview Middleware', () => {
    let mockReq: any;
    let mockRes: any;
    let nextCalled: boolean;

    beforeEach(() => {
        container.snapshot();
        nextCalled = false;
        mockReq = {
            headers: {},
            path: '',
            query: {},
        };
        mockRes = {
            status: function (code: number) {
                this.statusCode = code;
                return this;
            },
            send: function (content: string) {
                this.sentContent = content;
                return this;
            },
            statusCode: 0,
            sentContent: '',
        };
    });

    afterEach(() => {
        container.restore();
    });

    const next = () => {
        nextCalled = true;
    };

    test('should call next() if User-Agent is not a Discord bot', async () => {
        mockReq.headers['user-agent'] = 'Mozilla/5.0';
        mockReq.path = '/invite/testcode';

        await discordCrawlerPreview(mockReq, mockRes, next);

        assert.strictEqual(nextCalled, true);
        assert.strictEqual(mockRes.statusCode, 0);
    });

    test('should call next() if path is not an invite path', async () => {
        mockReq.headers['user-agent'] = 'Discordbot/2.0';
        mockReq.path = '/login';

        await discordCrawlerPreview(mockReq, mockRes, next);

        assert.strictEqual(nextCalled, true);
        assert.strictEqual(mockRes.statusCode, 0);
    });

    test('should serve minimal HTML if User-Agent is Discordbot and path is invite', async () => {
        mockReq.headers['user-agent'] = 'Discordbot/2.0';
        mockReq.path = '/invite/testcode';

        // Mock dependencies in container
        const mockInviteRepo = {
            findByCodeOrCustomPath: async () => ({
                _id: 'invite123',
                serverId: 'server123',
                code: 'testcode',
            }),
        };
        const mockServerRepo = {
            findById: async () => ({
                _id: 'server123',
                name: 'Test Server',
                icon: 'https://example.com/icon.png',
            }),
        };
        const mockMemberRepo = {
            countByServerId: async () => 42,
        };

        // Snapshot original container state or just rebind
        container.rebind(TYPES.InviteRepository).toConstantValue(mockInviteRepo as any);
        container.rebind(TYPES.ServerRepository).toConstantValue(mockServerRepo as any);
        container.rebind(TYPES.ServerMemberRepository).toConstantValue(mockMemberRepo as any);

        await discordCrawlerPreview(mockReq, mockRes, next);

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(mockRes.statusCode, 200);
        assert.ok(mockRes.sentContent.includes('<meta property="og:title" content="Join Test Server">'));
        assert.ok(mockRes.sentContent.includes('<meta property="og:description" content="You\'ve been invited to join Test Server on Serchat. Current members: 42.">'));
        assert.ok(mockRes.sentContent.includes('<meta name="theme-color" content="#5865F2">'));
    });

    test('should serve minimal HTML if testPreview=1 is present in query', async () => {
        mockReq.headers['user-agent'] = 'Mozilla/5.0';
        mockReq.path = '/invite/testcode';
        mockReq.query.testPreview = '1';

        // Mock dependencies in container
        const mockInviteRepo = {
            findByCodeOrCustomPath: async () => ({
                _id: 'invite123',
                serverId: 'server123',
                code: 'testcode',
            }),
        };
        const mockServerRepo = {
            findById: async () => ({
                _id: 'server123',
                name: 'Test Server',
                icon: 'https://example.com/icon.png',
            }),
        };
        const mockMemberRepo = {
            countByServerId: async () => 42,
        };

        container.rebind(TYPES.InviteRepository).toConstantValue(mockInviteRepo as any);
        container.rebind(TYPES.ServerRepository).toConstantValue(mockServerRepo as any);
        container.rebind(TYPES.ServerMemberRepository).toConstantValue(mockMemberRepo as any);

        await discordCrawlerPreview(mockReq, mockRes, next);

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(mockRes.statusCode, 200);
        assert.ok(mockRes.sentContent.includes('<meta property="og:title" content="Join Test Server">'));
    });
});
