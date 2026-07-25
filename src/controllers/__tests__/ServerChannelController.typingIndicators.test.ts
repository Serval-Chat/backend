/* eslint-disable @typescript-eslint/no-explicit-any */
import { Types } from 'mongoose';
import { ServerChannelController } from '../ServerChannelController';
import { generateSnowflakeId } from '@/utils/snowflake';

const mockChannelRepo = { findByServerId: jest.fn() };
const mockServerMemberRepo = { findByServerAndUser: jest.fn() };
const mockServerChannelReadRepo = { findByServerAndUser: jest.fn() };
const mockCategoryRepo = {};
const mockServerMessageRepo = { findLastByChannelAndUser: jest.fn() };
const mockPermissionService = {
    hasChannelPermissions: jest.fn(),
    hasCategoryPermissions: jest.fn(),
    normalizePermissionMap: jest.fn(),
    hasChannelPermission: jest.fn(),
};
const mockLogger = { error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
const mockWsServer = {};
const mockExportService = {};
const mockServerRepo = {};
const mockAuditLogRepo = {};
const mockServerAuditLogService = {};
const mockRoleRepo = {};

let mockRedisKeys: jest.Mock;
let mockRedisMget: jest.Mock;
const mockRedisClient = {
    get: jest.fn(),
    keys: jest.fn(),
    mget: jest.fn(),
    setex: jest.fn(),
};
const mockRedisService = { getClient: jest.fn(() => mockRedisClient) };

function buildController(): ServerChannelController {
    return new ServerChannelController(
        mockChannelRepo as any,
        mockServerMemberRepo as any,
        mockServerChannelReadRepo as any,
        mockCategoryRepo as any,
        mockServerMessageRepo as any,
        mockPermissionService as any,
        mockLogger as any,
        mockWsServer as any,
        mockExportService as any,
        mockServerRepo as any,
        mockAuditLogRepo as any,
        mockServerAuditLogService as any,
        mockRoleRepo as any,
        mockRedisService as any,
    );
}

const userId = new Types.ObjectId().toHexString();
const serverId = generateSnowflakeId();
const channelId = generateSnowflakeId();

function futureIso(offsetMs = 10_000): string {
    return new Date(Date.now() + offsetMs).toISOString();
}

function pastIso(offsetMs = 1_000): string {
    return new Date(Date.now() - offsetMs).toISOString();
}

describe('ServerChannelController – getTypingIndicators', () => {
    let controller: ServerChannelController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = buildController();
        mockRedisKeys = mockRedisClient.keys;
        mockRedisMget = mockRedisClient.mget;

        mockServerMemberRepo.findByServerAndUser.mockResolvedValue({ userId });
        mockPermissionService.hasChannelPermission.mockResolvedValue(true);
    });

    it('throws 403 when the caller is not a server member', async () => {
        mockServerMemberRepo.findByServerAndUser.mockResolvedValue(null);

        await expect(
            controller.getTypingIndicators(serverId, channelId, userId),
        ).rejects.toMatchObject({ status: 403 });

        expect(mockRedisClient.keys).not.toHaveBeenCalled();
    });

    it('throws 403 when the caller cannot view the channel', async () => {
        mockPermissionService.hasChannelPermission.mockResolvedValue(false);

        await expect(
            controller.getTypingIndicators(serverId, channelId, userId),
        ).rejects.toMatchObject({ status: 403 });

        expect(mockRedisClient.keys).not.toHaveBeenCalled();
    });

    it('returns empty typingUsers when no keys exist in Redis', async () => {
        mockRedisKeys.mockResolvedValue([]);

        const result = await controller.getTypingIndicators(
            serverId,
            channelId,
            userId,
        );

        expect(result).toEqual({ typingUsers: [] });
        expect(mockRedisMget).not.toHaveBeenCalled();
    });

    it('returns a typing user when a valid Redis key exists', async () => {
        const typerUserId = generateSnowflakeId();
        const key = `typing:channel:${channelId}:${typerUserId}`;
        const expiresAt = futureIso();

        mockRedisKeys.mockResolvedValue([key]);
        mockRedisMget.mockResolvedValue([
            JSON.stringify({ username: 'alice', expiresAt }),
        ]);

        const result = await controller.getTypingIndicators(
            serverId,
            channelId,
            userId,
        );

        expect(result.typingUsers).toHaveLength(1);
        expect(result.typingUsers[0]).toMatchObject({
            userId: typerUserId,
            username: 'alice',
            expiresAt,
        });
    });

    it('returns multiple typing users when several keys exist', async () => {
        const typerA = generateSnowflakeId();
        const typerB = generateSnowflakeId();
        const expiresAt = futureIso();

        mockRedisKeys.mockResolvedValue([
            `typing:channel:${channelId}:${typerA}`,
            `typing:channel:${channelId}:${typerB}`,
        ]);
        mockRedisMget.mockResolvedValue([
            JSON.stringify({ username: 'alice', expiresAt }),
            JSON.stringify({ username: 'bob', expiresAt }),
        ]);

        const result = await controller.getTypingIndicators(
            serverId,
            channelId,
            userId,
        );

        expect(result.typingUsers).toHaveLength(2);
        const usernames = result.typingUsers.map((u) => u.username).sort();
        expect(usernames).toEqual(['alice', 'bob']);
    });

    it('skips entries whose expiresAt is already in the past', async () => {
        const typerUserId = generateSnowflakeId();
        const key = `typing:channel:${channelId}:${typerUserId}`;

        mockRedisKeys.mockResolvedValue([key]);
        mockRedisMget.mockResolvedValue([
            JSON.stringify({ username: 'ghost', expiresAt: pastIso() }),
        ]);

        const result = await controller.getTypingIndicators(
            serverId,
            channelId,
            userId,
        );

        expect(result.typingUsers).toHaveLength(0);
    });

    it('filters out expired entries while keeping valid ones', async () => {
        const typerA = generateSnowflakeId();
        const typerB = generateSnowflakeId();
        const validExpiry = futureIso();
        const expiredExpiry = pastIso();

        mockRedisKeys.mockResolvedValue([
            `typing:channel:${channelId}:${typerA}`,
            `typing:channel:${channelId}:${typerB}`,
        ]);
        mockRedisMget.mockResolvedValue([
            JSON.stringify({ username: 'alive', expiresAt: validExpiry }),
            JSON.stringify({ username: 'ghost', expiresAt: expiredExpiry }),
        ]);

        const result = await controller.getTypingIndicators(
            serverId,
            channelId,
            userId,
        );

        expect(result.typingUsers).toHaveLength(1);
        expect(result.typingUsers[0]?.username).toBe('alive');
    });

    it('skips null Redis values (key evicted between KEYS and MGET)', async () => {
        const typerUserId = generateSnowflakeId();
        const key = `typing:channel:${channelId}:${typerUserId}`;

        mockRedisKeys.mockResolvedValue([key]);
        mockRedisMget.mockResolvedValue([null]); // evicted

        const result = await controller.getTypingIndicators(
            serverId,
            channelId,
            userId,
        );

        expect(result.typingUsers).toHaveLength(0);
    });

    it('skips malformed JSON values without throwing', async () => {
        const typerUserId = generateSnowflakeId();
        const key = `typing:channel:${channelId}:${typerUserId}`;

        mockRedisKeys.mockResolvedValue([key]);
        mockRedisMget.mockResolvedValue(['not-valid-json']);

        await expect(
            controller.getTypingIndicators(serverId, channelId, userId),
        ).resolves.toEqual({ typingUsers: [] });
    });

    it('queries Redis with the correct key pattern for the channel', async () => {
        mockRedisKeys.mockResolvedValue([]);

        await controller.getTypingIndicators(serverId, channelId, userId);

        expect(mockRedisClient.keys).toHaveBeenCalledWith(
            `typing:channel:${channelId}:*`,
        );
    });

    it('checks viewChannels permission (not sendMessages) for the HTTP read', async () => {
        mockRedisKeys.mockResolvedValue([]);

        await controller.getTypingIndicators(serverId, channelId, userId);

        expect(mockPermissionService.hasChannelPermission).toHaveBeenCalledWith(
            serverId,
            userId,
            channelId,
            'viewChannels',
        );
    });
});
