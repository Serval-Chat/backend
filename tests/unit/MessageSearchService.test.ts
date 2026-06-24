import { Types } from 'mongoose';
import type { IMessage } from '../../src/di/interfaces/IMessageRepository';
import type { IServerMessage } from '../../src/di/interfaces/IServerMessageRepository';

const mockIndices = {
    exists: jest.fn(),
    create: jest.fn(),
};

const mockClient = {
    indices: mockIndices,
    index: jest.fn(),
    delete: jest.fn(),
    search: jest.fn(),
    update: jest.fn(),
};

jest.mock('@elastic/elasticsearch', () => ({
    Client: jest.fn(() => mockClient),
}));

jest.mock('../../src/config/env', () => ({
    ELASTICSEARCH_URL: 'http://localhost:9200',
    SNOWFLAKE_WORKER_ID: 0,
}));

// mock the TYPES so @Inject resolves without a real DI container
jest.mock('../../src/di/types', () => ({
    TYPES: { RedisService: 'RedisService' },
}));

import {
    MessageSearchService,
    DM_MESSAGES_INDEX,
    CHANNEL_MESSAGES_INDEX,
} from '../../src/services/MessageSearchService';


const mockRedisClient = {
    get: jest.fn(),
    setex: jest.fn().mockResolvedValue('OK'),
};

const mockRedisService = {
    getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const makeDmMessage = (overrides: Partial<IMessage> = {}): IMessage =>
    ({
        _id: new Types.ObjectId(),
        snowflakeId: new Types.ObjectId().toString(),
        senderId: new Types.ObjectId(),
        receiverId: new Types.ObjectId(),
        text: 'hello world',
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
        senderDeleted: false,
        receiverDeleted: false,
        ...overrides,
    }) as IMessage;

const makeChannelMessage = (overrides: Partial<IServerMessage> = {}): IServerMessage =>
    ({
        _id: new Types.ObjectId(),
        snowflakeId: new Types.ObjectId().toString(),
        senderId: new Types.ObjectId(),
        channelId: new Types.ObjectId(),
        serverId: new Types.ObjectId(),
        text: 'channel hello',
        createdAt: new Date('2026-01-01T12:00:00.000Z'),
        ...overrides,
    }) as IServerMessage;

const makeSearchResponse = (hits: unknown[], total: number) => ({
    hits: {
        total: { value: total },
        hits: hits.map((src) => ({
            _id: (src as Record<string, unknown>).id ?? 'hit-id',
            _source: src,
            highlight: { text: [`<mark>match</mark>`] },
        })),
    },
});


describe('MessageSearchService', () => {
    let service: MessageSearchService;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisClient.get.mockResolvedValue(null); // cache miss by default
        service = new MessageSearchService(mockRedisService as never);
    });


    describe('ensureDmIndex', () => {
        it('creates the DM index when absent', async () => {
            mockIndices.exists.mockResolvedValueOnce(false);
            mockIndices.create.mockResolvedValueOnce({});

            await service.ensureDmIndex();

            expect(mockIndices.exists).toHaveBeenCalledWith({ index: DM_MESSAGES_INDEX });
            expect(mockIndices.create).toHaveBeenCalledWith(
                expect.objectContaining({ index: DM_MESSAGES_INDEX }),
            );
        });

        it('does not create the DM index when it already exists', async () => {
            mockIndices.exists.mockResolvedValueOnce(true);

            await service.ensureDmIndex();

            expect(mockIndices.create).not.toHaveBeenCalled();
        });

        it('swallows errors if ES is down', async () => {
            mockIndices.exists.mockRejectedValueOnce(new Error('connection refused'));

            await expect(service.ensureDmIndex()).resolves.toBeUndefined();
        });
    });

    describe('ensureChannelIndex', () => {
        it('creates the channel index when absent', async () => {
            mockIndices.exists.mockResolvedValueOnce(false);
            mockIndices.create.mockResolvedValueOnce({});

            await service.ensureChannelIndex();

            expect(mockIndices.create).toHaveBeenCalledWith(
                expect.objectContaining({ index: CHANNEL_MESSAGES_INDEX }),
            );
        });

        it('swallows errors if ES is down', async () => {
            mockIndices.exists.mockRejectedValueOnce(new Error('connection refused'));

            await expect(service.ensureChannelIndex()).resolves.toBeUndefined();
        });
    });


    describe('indexDmMessage', () => {
        it('sends a correctly shaped document to ES', async () => {
            mockClient.index.mockResolvedValueOnce({});
            const msg = makeDmMessage();

            await service.indexDmMessage(msg);

            expect(mockClient.index).toHaveBeenCalledWith(
                expect.objectContaining({
                    index: DM_MESSAGES_INDEX,
                    id: msg.snowflakeId,
                    document: expect.objectContaining({
                        id: msg.snowflakeId,
                        senderId: msg.senderId.toString(),
                        receiverId: msg.receiverId.toString(),
                        text: msg.text,
                        senderDeleted: false,
                        receiverDeleted: false,
                    }),
                    refresh: false,
                }),
            );
        });

        it('does not throw when ES rejects', async () => {
            mockClient.index.mockRejectedValueOnce(new Error('index error'));

            await expect(service.indexDmMessage(makeDmMessage())).resolves.toBeUndefined();
        });
    });

    describe('indexChannelMessage', () => {
        it('sends a correctly shaped document to ES', async () => {
            mockClient.index.mockResolvedValueOnce({});
            const msg = makeChannelMessage();

            await service.indexChannelMessage(msg);

            expect(mockClient.index).toHaveBeenCalledWith(
                expect.objectContaining({
                    index: CHANNEL_MESSAGES_INDEX,
                    id: msg.snowflakeId,
                    document: expect.objectContaining({
                        id: msg.snowflakeId,
                        senderId: msg.senderId.toString(),
                        channelId: msg.channelId.toString(),
                        serverId: msg.serverId.toString(),
                        text: msg.text,
                        isDeleted: false,
                    }),
                }),
            );
        });

        it('marks isDeleted true when deletedAt is set', async () => {
            mockClient.index.mockResolvedValueOnce({});
            const msg = makeChannelMessage({ deletedAt: new Date() });

            await service.indexChannelMessage(msg);

            expect(mockClient.index).toHaveBeenCalledWith(
                expect.objectContaining({
                    document: expect.objectContaining({ isDeleted: true }),
                }),
            );
        });

        it('does not throw when ES rejects', async () => {
            mockClient.index.mockRejectedValueOnce(new Error('index error'));

            await expect(service.indexChannelMessage(makeChannelMessage())).resolves.toBeUndefined();
        });
    });


    describe('removeDmMessage', () => {
        it('calls client.delete with correct index and id', async () => {
            mockClient.delete.mockResolvedValueOnce({});

            await service.removeDmMessage('abc123');

            expect(mockClient.delete).toHaveBeenCalledWith({ index: DM_MESSAGES_INDEX, id: 'abc123' });
        });

        it('silently ignores 404 (message already deleted)', async () => {
            const err = new Error('not found') as Error & { statusCode: number };
            err.statusCode = 404;
            mockClient.delete.mockRejectedValueOnce(err);

            await expect(service.removeDmMessage('abc123')).resolves.toBeUndefined();
        });

        it('does not throw on non-404 errors', async () => {
            mockClient.delete.mockRejectedValueOnce(new Error('cluster error'));

            await expect(service.removeDmMessage('abc123')).resolves.toBeUndefined();
        });
    });

    describe('removeChannelMessage', () => {
        it('calls client.delete with correct index and id', async () => {
            mockClient.delete.mockResolvedValueOnce({});

            await service.removeChannelMessage('ch-msg-1');

            expect(mockClient.delete).toHaveBeenCalledWith({ index: CHANNEL_MESSAGES_INDEX, id: 'ch-msg-1' });
        });

        it('silently ignores 404', async () => {
            const err = new Error('not found') as Error & { statusCode: number };
            err.statusCode = 404;
            mockClient.delete.mockRejectedValueOnce(err);

            await expect(service.removeChannelMessage('ch-msg-1')).resolves.toBeUndefined();
        });
    });

    // partial flag updates (pin/sticky): must not clobber other indexed fields

    describe('updateChannelMessageFlags', () => {
        it('sends a partial update for isPinned without touching other fields', async () => {
            mockClient.update.mockResolvedValueOnce({});

            await service.updateChannelMessageFlags('ch-msg-1', { isPinned: true });

            expect(mockClient.update).toHaveBeenCalledWith({
                index: CHANNEL_MESSAGES_INDEX,
                id: 'ch-msg-1',
                doc: { is_pinned: true },
            });
            // specifically must not re-send the full document (which would reset
            // is_bot/is_webhook back to their indexDmMessage/indexChannelMessage defaults)
            expect(mockClient.index).not.toHaveBeenCalled();
        });

        it('sends a partial update for isSticky', async () => {
            mockClient.update.mockResolvedValueOnce({});

            await service.updateChannelMessageFlags('ch-msg-1', { isSticky: false });

            expect(mockClient.update).toHaveBeenCalledWith({
                index: CHANNEL_MESSAGES_INDEX,
                id: 'ch-msg-1',
                doc: { is_sticky: false },
            });
        });

        it('does not throw when ES rejects', async () => {
            mockClient.update.mockRejectedValueOnce(new Error('cluster down'));

            await expect(
                service.updateChannelMessageFlags('ch-msg-1', { isPinned: true }),
            ).resolves.toBeUndefined();
        });

        it('silently ignores 404 (message not indexed yet)', async () => {
            const err = new Error('not found') as Error & { statusCode: number };
            err.statusCode = 404;
            mockClient.update.mockRejectedValueOnce(err);

            await expect(
                service.updateChannelMessageFlags('ch-msg-1', { isPinned: true }),
            ).resolves.toBeUndefined();
        });
    });


    describe('searchDmMessages', () => {
        const userId = new Types.ObjectId().toHexString();
        const otherUserId = new Types.ObjectId().toHexString();

        it('returns mapped hits with highlight on cache miss', async () => {
            const hitSrc = {
                id: 'msg-1',
                senderId: userId,
                receiverId: otherUserId,
                text: 'hello world',
                createdAt: '2026-01-01T12:00:00.000Z',
            };
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([hitSrc], 1));

            const result = await service.searchDmMessages(userId, otherUserId, 'hello', 10, 0);

            expect(result.total).toBe(1);
            expect(result.hits).toHaveLength(1);
            expect(result.hits[0]).toMatchObject({
                id: 'msg-1',
                senderId: userId,
                receiverId: otherUserId,
                text: 'hello world',
                highlight: '<mark>match</mark>',
            });
        });

        it('sends a two-branch should filter covering both DM directions', async () => {
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await service.searchDmMessages(userId, otherUserId, 'test', 25, 0);

            const call = mockClient.search.mock.calls[0][0] as Record<string, unknown>;
            const filter = (call.query as Record<string, unknown>).bool as Record<string, unknown>;
            const filterArr = filter.filter as unknown[];
            const shouldClause = (filterArr[0] as Record<string, unknown>).bool as Record<string, unknown>;
            const shouldBranches = shouldClause.should as unknown[];

            expect(shouldBranches).toHaveLength(2);

            const branch1 = (shouldBranches[0] as Record<string, unknown>).bool as Record<string, unknown>;
            const branch1Must = branch1.must as unknown[];
            expect(branch1Must).toEqual(
                expect.arrayContaining([
                    { term: { senderId: userId } },
                    { term: { receiverId: otherUserId } },
                    { term: { senderDeleted: false } },
                ]),
            );

            const branch2 = (shouldBranches[1] as Record<string, unknown>).bool as Record<string, unknown>;
            const branch2Must = branch2.must as unknown[];
            expect(branch2Must).toEqual(
                expect.arrayContaining([
                    { term: { senderId: otherUserId } },
                    { term: { receiverId: userId } },
                    { term: { receiverDeleted: false } },
                ]),
            );
        });

        it('propagates ES errors to the caller (no silent swallow)', async () => {
            mockClient.search.mockRejectedValueOnce(new Error('cluster down'));

            await expect(
                service.searchDmMessages(userId, otherUserId, 'hello', 10, 0),
            ).rejects.toThrow('cluster down');
        });

        it('asks Elasticsearch to HTML-escape highlighted text (prevents stored XSS via raw message HTML)', async () => {
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await service.searchDmMessages(userId, otherUserId, 'hello', 10, 0);

            const call = mockClient.search.mock.calls[0][0] as Record<string, unknown>;
            const highlight = call.highlight as Record<string, unknown>;
            expect(highlight.encoder).toBe('html');
        });

        it('applies the date range filter when "after" is set even if "before" is an empty string', async () => {
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await service.searchDmMessages(userId, otherUserId, 'hello', 10, 0, {
                after: '2026-01-01T00:00:00.000Z',
                before: '',
            });

            const call = mockClient.search.mock.calls[0][0] as Record<string, unknown>;
            const filter = (call.query as Record<string, unknown>).bool as Record<string, unknown>;
            const filterArr = filter.filter as unknown[];

            expect(filterArr).toEqual(
                expect.arrayContaining([
                    { range: { createdAt: { gte: '2026-01-01T00:00:00.000Z' } } },
                ]),
            );
        });

        // caching

        it('returns cached result without hitting ES on cache hit', async () => {
            const cached = { hits: [{ id: 'cached-msg', senderId: userId, receiverId: otherUserId, text: 'cached', createdAt: '' }], total: 1 };
            mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cached));

            const result = await service.searchDmMessages(userId, otherUserId, 'hello', 10, 0);

            expect(result).toEqual(cached);
            expect(mockClient.search).not.toHaveBeenCalled();
        });

        it('writes result to cache after an ES hit', async () => {
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await service.searchDmMessages(userId, otherUserId, 'hello', 10, 0);

            // allow the fire-and-forget setex to resolve
            await Promise.resolve();

            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                `search:dm:${userId}:${otherUserId}:hello:10:0`,
                30,
                expect.any(String),
            );
        });

        it('does not serve a stale cache entry from a different user perspective', async () => {
            // user A queries A<->B
            const aResult = { hits: [], total: 0 };
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));
            await service.searchDmMessages(userId, otherUserId, 'hello', 10, 0);

            // simulate user B querying B<->A, cache key must differ because userId is first
            mockRedisClient.get.mockResolvedValueOnce(null);
            const bResult = { hits: [{ id: 'b-sees-this' }], total: 1 };
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([{ id: 'b-sees-this' }], 1));
            const result = await service.searchDmMessages(otherUserId, userId, 'hello', 10, 0);

            // B's query goes to ES (different cache key) and gets B's own result, not A's
            expect(mockClient.search).toHaveBeenCalledTimes(2);
            expect(aResult).not.toEqual(result);
            expect(result).toMatchObject(bResult);
        });

        it('still returns ES results if cache write fails', async () => {
            mockRedisClient.setex.mockRejectedValueOnce(new Error('redis down'));
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await expect(
                service.searchDmMessages(userId, otherUserId, 'hello', 10, 0),
            ).resolves.toEqual({ hits: [], total: 0 });
        });

        it('falls back to ES when cache read throws', async () => {
            mockRedisClient.get.mockRejectedValueOnce(new Error('redis error'));
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            const result = await service.searchDmMessages(userId, otherUserId, 'hello', 10, 0);

            expect(result).toEqual({ hits: [], total: 0 });
            expect(mockClient.search).toHaveBeenCalledTimes(1);
        });
    });


    describe('searchChannelMessages', () => {
        const channelId = new Types.ObjectId().toHexString();

        it('returns mapped hits with highlight on cache miss', async () => {
            const hitSrc = {
                id: 'ch-msg-1',
                senderId: new Types.ObjectId().toHexString(),
                channelId,
                serverId: new Types.ObjectId().toHexString(),
                text: 'channel hello',
                createdAt: '2026-01-01T12:00:00.000Z',
            };
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([hitSrc], 1));

            const result = await service.searchChannelMessages(channelId, 'hello', 10, 0);

            expect(result.total).toBe(1);
            expect(result.hits[0]).toMatchObject({
                id: 'ch-msg-1',
                channelId,
                text: 'channel hello',
                highlight: '<mark>match</mark>',
            });
        });

        it('filters by channelId and isDeleted: false', async () => {
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await service.searchChannelMessages(channelId, 'test', 25, 0);

            const call = mockClient.search.mock.calls[0][0] as Record<string, unknown>;
            const filter = (call.query as Record<string, unknown>).bool as Record<string, unknown>;
            const filterArr = filter.filter as unknown[];

            expect(filterArr).toEqual(
                expect.arrayContaining([
                    { term: { channelId } },
                    { term: { isDeleted: false } },
                ]),
            );
        });

        it('propagates ES errors to the caller (no silent swallow)', async () => {
            mockClient.search.mockRejectedValueOnce(new Error('ES error'));

            await expect(
                service.searchChannelMessages(channelId, 'hello', 10, 0),
            ).rejects.toThrow('ES error');
        });

        // caching

        it('returns cached result without hitting ES on cache hit', async () => {
            const cached = { hits: [], total: 0 };
            mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cached));

            const result = await service.searchChannelMessages(channelId, 'hello', 10, 0);

            expect(result).toEqual(cached);
            expect(mockClient.search).not.toHaveBeenCalled();
        });

        it('writes result to cache after an ES hit', async () => {
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await service.searchChannelMessages(channelId, 'hello', 10, 0);
            await Promise.resolve();

            expect(mockRedisClient.setex).toHaveBeenCalledWith(
                `search:ch:${channelId}:hello:10:0`,
                30,
                expect.any(String),
            );
        });

        it('still returns ES results if cache write fails', async () => {
            mockRedisClient.setex.mockRejectedValueOnce(new Error('redis down'));
            mockClient.search.mockResolvedValueOnce(makeSearchResponse([], 0));

            await expect(
                service.searchChannelMessages(channelId, 'hello', 10, 0),
            ).resolves.toEqual({ hits: [], total: 0 });
        });
    });
});
