/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars */
import { EmbedService } from '../EmbedService';
import { Types } from 'mongoose';
import type {
    IServerMessageRepository,
    IServerMessage,
} from '@/di/interfaces/IServerMessageRepository';
import type {
    IMessageRepository,
    IMessage,
} from '@/di/interfaces/IMessageRepository';
import type { IWsServer } from '@/ws/interfaces/IWsServer';
import type { IRedisService } from '@/di/interfaces/IRedisService';
import type { ScraperService } from '../ScraperService';
import type { FetchResult } from '@/types/scraper';

describe('EmbedService', () => {
    let service: EmbedService;
    let mockScraperService: jest.Mocked<ScraperService>;
    let mockServerMessageRepo: jest.Mocked<IServerMessageRepository>;
    let mockMessageRepo: jest.Mocked<IMessageRepository>;
    let mockWsServer: jest.Mocked<IWsServer>;
    let mockRedisService: jest.Mocked<IRedisService>;
    let mockRedisClient: any;

    beforeEach(() => {
        mockScraperService = {
            scrape: jest.fn(),
        } as any;

        mockServerMessageRepo = {
            update: jest.fn().mockResolvedValue({}),
        } as any;

        mockMessageRepo = {
            updateMessage: jest.fn().mockResolvedValue({}),
        } as any;

        mockWsServer = {
            broadcastToChannel: jest.fn(),
            broadcastToUser: jest.fn(),
            broadcastToServerWithPermission: jest
                .fn()
                .mockResolvedValue(undefined),
        } as any;

        mockRedisClient = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue('OK'),
        };

        mockRedisService = {
            getClient: jest.fn().mockReturnValue(mockRedisClient),
        } as any;

        service = new EmbedService(
            mockScraperService,
            mockServerMessageRepo,
            mockMessageRepo,
            mockWsServer,
            mockRedisService,
        );
    });

    describe('processMessage', () => {
        const mockFetchResult: FetchResult = {
            url: 'https://example.com/',
            title: 'Example Title',
            description: 'Example Description',
            size: 1024,
            contentType: 'text/html',
            mimeType: 'text/html',
        };

        it('should scrape a new URL and save it as an embed', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'Check this out: https://example.com',
                embeds: [],
            } as any;

            mockScraperService.scrape.mockResolvedValue(mockFetchResult);

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).toHaveBeenCalledWith(
                'https://example.com',
            );
            expect(mockServerMessageRepo.update).toHaveBeenCalledWith(
                message.snowflakeId,
                expect.objectContaining({
                    embeds: [
                        expect.objectContaining({
                            url: 'https://example.com/',
                            title: 'Example Title',
                        }),
                    ],
                }),
            );
            expect(
                mockWsServer.broadcastToServerWithPermission,
            ).toHaveBeenCalled();
        });

        it('should allow multiple embeds for the same URL if it appears multiple times', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'https://example.com and again https://example.com',
                embeds: [],
            } as any;

            mockScraperService.scrape.mockResolvedValue(mockFetchResult);

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).toHaveBeenCalledTimes(2);
            expect(mockServerMessageRepo.update).toHaveBeenCalledWith(
                message.snowflakeId,
                expect.objectContaining({
                    embeds: [
                        expect.objectContaining({
                            url: 'https://example.com/',
                        }),
                        expect.objectContaining({
                            url: 'https://example.com/',
                        }),
                    ],
                }),
            );
        });

        it('should use cached embed if available', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'https://cached.com',
                embeds: [],
            } as any;

            const cachedEmbed = {
                type: 'link',
                url: 'https://cached.com',
                title: 'Cached',
            };
            mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedEmbed));

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).not.toHaveBeenCalled();
            expect(mockServerMessageRepo.update).toHaveBeenCalledWith(
                message.snowflakeId,
                expect.objectContaining({
                    embeds: [expect.objectContaining({ title: 'Cached' })],
                }),
            );
        });

        it('should not re-scrape if message already has enough embeds for that URL', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'https://example.com',
                embeds: [{ type: 'link', url: 'https://example.com/' }],
            } as any;

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).not.toHaveBeenCalled();
            expect(mockServerMessageRepo.update).not.toHaveBeenCalled();
        });

        it('should supplement missing embeds if count in text is higher than current embeds', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'https://example.com https://example.com',
                embeds: [{ type: 'link', url: 'https://example.com/' }],
            } as any;

            mockScraperService.scrape.mockResolvedValue(mockFetchResult);

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).toHaveBeenCalledTimes(1);
            expect(mockServerMessageRepo.update).toHaveBeenCalledWith(
                message.snowflakeId,
                expect.objectContaining({
                    embeds: [
                        expect.objectContaining({
                            url: 'https://example.com/',
                        }),
                        expect.objectContaining({
                            url: 'https://example.com/',
                        }),
                    ],
                }),
            );
        });

        it('should skip invite links', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'Join here: https://catfla.re/invite/abc',
                embeds: [],
            } as any;

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).not.toHaveBeenCalled();
        });

        it('should skip Klipy links', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'Check out this GIF: https://klipy.com/gifs/so-cute-cat-5--kAIU192Mj',
                embeds: [],
            } as any;

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).not.toHaveBeenCalled();
            expect(mockServerMessageRepo.update).not.toHaveBeenCalled();
        });

        it('should handle trailing slash differences during comparison', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'https://example.com/',
                embeds: [{ type: 'link', url: 'https://example.com' }],
            } as any;

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).not.toHaveBeenCalled();
        });

        it('should limit total embeds to 5', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'https://1.com https://2.com https://3.com https://4.com https://5.com https://6.com',
                embeds: [],
            } as any;

            mockScraperService.scrape.mockResolvedValue(mockFetchResult);

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).toHaveBeenCalledTimes(5);
            expect(mockServerMessageRepo.update).toHaveBeenCalledWith(
                message.snowflakeId,
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.anything(),
                        expect.anything(),
                        expect.anything(),
                        expect.anything(),
                        expect.anything(),
                    ]),
                }),
            );

            const updateArgs = mockServerMessageRepo.update.mock
                .calls[0]![1] as any;
            expect(updateArgs.embeds.length).toBe(5);
        });

        it('should skip embed scraping completely if noEmbeds is true', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'Check this out: https://example.com',
                embeds: [],
                noEmbeds: true,
            } as any;

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).not.toHaveBeenCalled();
            expect(mockServerMessageRepo.update).not.toHaveBeenCalled();
        });

        it('should not scrape URLs wrapped in angle brackets', async () => {
            const message = {
                _id: new Types.ObjectId(),
                snowflakeId: new Types.ObjectId().toString(),
                serverId: new Types.ObjectId(),
                channelId: new Types.ObjectId(),
                text: 'Hidden <https://example.com> visible https://visible.example',
                embeds: [],
            } as any;

            mockScraperService.scrape.mockResolvedValue({
                ...mockFetchResult,
                url: 'https://visible.example/',
            });

            await service.processServerMessage(message);

            expect(mockScraperService.scrape).toHaveBeenCalledTimes(1);
            expect(mockScraperService.scrape).toHaveBeenCalledWith(
                'https://visible.example',
            );
        });
    });
});
