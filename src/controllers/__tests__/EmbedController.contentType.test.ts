import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

const mockScraper = { port: 0 };

jest.mock('@/config/env', () => ({
    get SCRAPER_HOST() {
        return '127.0.0.1';
    },
    get SCRAPER_PORT() {
        return mockScraper.port;
    },
}));

import { EmbedController } from '../EmbedController';

const HOSTILE_BODY = '<script>alert(document.domain)</script>';
const VALID_FILE = 'a'.repeat(32) + '.webp';

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

const redisService = {
    getClient: () => ({ get: jest.fn().mockResolvedValue('1') }),
};

const scraperService = { scrape: jest.fn() };

interface FakeResponse {
    statusCode: number;
    body?: unknown;
    ended: boolean;
    headers: Record<string, string>;
    chunks: Buffer[];
    setHeader(name: string, value: string): void;
    status(code: number): FakeResponse;
    send(body: unknown): FakeResponse;
    write(chunk: unknown): void;
    end(): void;
}

function fakeResponse(): FakeResponse {
    return {
        statusCode: 200,
        ended: false,
        headers: {},
        chunks: [],
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        send(body) {
            this.body = body;
            return this;
        },
        write(chunk) {
            this.chunks.push(Buffer.from(chunk as Buffer));
        },
        end() {
            this.ended = true;
        },
    };
}

describe('EmbedController content type handling', () => {
    let scraper: Server;
    let requestedPaths: string[];
    let controller: EmbedController;

    beforeAll(async () => {
        requestedPaths = [];
        scraper = createServer((req, res) => {
            requestedPaths.push(req.url ?? '');
            // A scraper that has been induced to serve an HTML page.
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(HOSTILE_BODY);
        });

        await new Promise<void>((resolve) => {
            scraper.listen(0, '127.0.0.1', resolve);
        });
        mockScraper.port = (scraper.address() as AddressInfo).port;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => {
            scraper.close(() => resolve());
        });
    });

    beforeEach(() => {
        jest.clearAllMocks();
        requestedPaths = [];
        controller = new EmbedController(
            logger,
            redisService as never,
            scraperService as never,
        );
    });

    describe('proxy-image', () => {
        it('does not copy a hostile upstream content type', async () => {
            const res = fakeResponse();

            await controller.proxyImage(VALID_FILE, res as never);

            expect(res.headers['content-type']).toBe('image/webp');
            expect(res.headers['content-type']).not.toContain('text/html');
        });

        it('sets nosniff and an inline disposition', async () => {
            const res = fakeResponse();

            await controller.proxyImage(VALID_FILE, res as never);

            expect(res.headers['x-content-type-options']).toBe('nosniff');
            expect(res.headers['content-disposition']).toBe(
                'inline; filename="image.webp"',
            );
        });

        it('rejects a filename outside the cache namespace', async () => {
            const res = fakeResponse();

            await controller.proxyImage('../../etc/passwd', res as never);

            expect(res.statusCode).toBe(400);
            expect(requestedPaths).toHaveLength(0);
        });
    });

    describe('proxy', () => {
        it('does not copy a hostile upstream content type', async () => {
            scraperService.scrape.mockResolvedValue({ image: VALID_FILE });
            const res = fakeResponse();

            await controller.proxy('https://example.com/a', res as never);

            expect(res.headers['content-type']).toBe('image/webp');
            expect(res.headers['x-content-type-options']).toBe('nosniff');
        });

        it.each(['../../../etc/passwd', 'x.html', ''])(
            'refuses the scraper cache name %p instead of fetching it',
            async (image) => {
                scraperService.scrape.mockResolvedValue({ image });
                const res = fakeResponse();

                await controller.proxy('https://example.com/a', res as never);

                expect(res.statusCode).toBe(502);
                expect(requestedPaths).toHaveLength(0);
            },
        );
    });
});
