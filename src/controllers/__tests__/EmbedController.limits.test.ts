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

const VALID_FILE = 'b'.repeat(32) + '.webp';
const ALLOWED_URL = 'https://example.com/cached';
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
    public bytes = 0;
    public headersSent = false;

    public _write(
        chunk: Buffer,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void,
    ): void {
        this.bytes += chunk.length;
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

describe('embed proxy limits', () => {
    let scraper: Server;
    let requestedPaths: string[];
    let behaviour: 'ok' | 'hang' | 'huge' | 'missing';
    let controller: EmbedController;

    beforeAll(async () => {
        scraper = createServer((req, res) => {
            requestedPaths.push(req.url ?? '');
            if (behaviour === 'hang') return;
            if (behaviour === 'missing') {
                res.writeHead(404).end('nope');
                return;
            }
            if (behaviour === 'huge') {
                res.writeHead(200, {
                    'Content-Type': 'image/webp',
                    'Content-Length': String(64 * 1024 * 1024),
                });
                res.end(Buffer.alloc(1024));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'image/webp' });
            res.end(Buffer.alloc(64));
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
        scraper.closeAllConnections();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        redisStore.clear();
        redisStore.set(`proxy:allow:${ALLOWED_HASH}`, ALLOWED_URL);
        requestedPaths = [];
        behaviour = 'ok';
        controller = new EmbedController(
            logger,
            redisService as never,
            scraperService as never,
        );
    });

    it('scrapes once, then serves repeats from the resolved cache', async () => {
        scraperService.scrape.mockResolvedValue({ image: VALID_FILE });

        await controller.proxy(ALLOWED_URL, new FakeResponse() as never);
        await controller.proxy(ALLOWED_URL, new FakeResponse() as never);
        await controller.proxy(ALLOWED_URL, new FakeResponse() as never);

        expect(scraperService.scrape).toHaveBeenCalledTimes(1);
        expect(requestedPaths).toHaveLength(3);
        expect(redisStore.get(`proxy:image:${ALLOWED_HASH}`)).toBe(VALID_FILE);
    });

    it('re-scrapes when the cached file has been evicted upstream', async () => {
        redisStore.set(`proxy:image:${ALLOWED_HASH}`, VALID_FILE);
        scraperService.scrape.mockResolvedValue({ image: VALID_FILE });
        behaviour = 'missing';

        await controller.proxy(ALLOWED_URL, new FakeResponse() as never);

        expect(scraperService.scrape).toHaveBeenCalledTimes(1);
    });

    it('ignores a cached value that is not a cache filename', async () => {
        redisStore.set(`proxy:image:${ALLOWED_HASH}`, '../../etc/passwd');
        scraperService.scrape.mockResolvedValue({ image: VALID_FILE });

        await controller.proxy(ALLOWED_URL, new FakeResponse() as never);

        expect(scraperService.scrape).toHaveBeenCalledTimes(1);
        expect(requestedPaths.every((p) => p.includes(VALID_FILE))).toBe(true);
    });

    it('refuses an upstream image that declares a size over the cap', async () => {
        behaviour = 'huge';
        const res = new FakeResponse();

        await controller.proxyImage(VALID_FILE, res as never);

        expect(res.statusCode).toBe(502);
        expect(res.body).toBe('Upstream image too large');
        expect(res.bytes).toBe(0);
    });

    it('gives up on a scraper that never responds', async () => {
        behaviour = 'hang';
        const res = new FakeResponse();

        const started = Date.now();
        await controller.proxyImage(VALID_FILE, res as never);
        const elapsed = Date.now() - started;

        expect(elapsed).toBeLessThan(9_000);
        expect(res.statusCode).toBe(500);
        expect(logger.error).toHaveBeenCalled();
    }, 15_000);
});
