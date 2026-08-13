import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { createHash } from 'node:crypto';

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
const ALLOWED_URL = 'https://example.com/a';
const ALLOWED_HASH = createHash('sha256').update(ALLOWED_URL).digest('hex');

const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};

const redisStore = new Map<string, string>();
const redisClient = {
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
        redisStore.set(key, value);
        return 'OK';
    }),
    del: jest.fn(async (key: string) => {
        redisStore.delete(key);
        return 1;
    }),
};
const redisService = { getClient: () => redisClient };

const scraperService = { scrape: jest.fn() };

class FakeResponse extends Writable {
    public statusCode = 200;
    public body?: unknown;
    public headers: Record<string, string> = {};
    public chunks: Buffer[] = [];
    public headersSent = false;

    public _write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        this.chunks.push(Buffer.from(chunk));
        callback();
    }

    public setHeader(name: string, value: string): void {
        this.headers[name.toLowerCase()] = value;
        this.headersSent = true;
    }

    public status(code: number): this {
        this.statusCode = code;
        return this;
    }

    public send(body: unknown): this {
        this.body = body;
        return this;
    }
}

function fakeResponse(): FakeResponse {
    return new FakeResponse();
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
        redisStore.clear();
        redisStore.set(`proxy:allow:${ALLOWED_HASH}`, ALLOWED_URL);
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

            await controller.proxy(ALLOWED_URL, res as never);

            expect(res.headers['content-type']).toBe('image/webp');
            expect(res.headers['x-content-type-options']).toBe('nosniff');
        });

        it.each(['../../../etc/passwd', 'x.html', ''])(
            'refuses the scraper cache name %p instead of fetching it',
            async (image) => {
                scraperService.scrape.mockResolvedValue({ image });
                const res = fakeResponse();

                await controller.proxy(ALLOWED_URL, res as never);

                expect(res.statusCode).toBe(502);
                expect(requestedPaths).toHaveLength(0);
            },
        );
    });
});
