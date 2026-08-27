import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import { discordCrawlerPreview } from '../crawlerPreview';
import { isInviteUsable } from '@/utils/invite';

const HOSTILE_ICON = '"><script>alert(document.domain)</script><meta x="';

const invite = { serverId: 'server-1' };

function repos(icon: string) {
    return {
        [TYPES.InviteRepository]: {
            findByCode: jest.fn().mockResolvedValue(invite),
        },
        [TYPES.VanityLinkRepository]: {
            findByCode: jest.fn().mockResolvedValue(null),
        },
        [TYPES.ServerRepository]: {
            findById: jest.fn().mockResolvedValue({
                snowflakeId: 'server-1',
                name: 'Test Server',
                icon,
            }),
        },
        [TYPES.ServerMemberRepository]: {
            countByServerId: jest.fn().mockResolvedValue(3),
            findByServerId: jest.fn().mockResolvedValue([]),
        },
    } as Record<symbol, unknown>;
}

function request(overrides: Record<string, unknown> = {}) {
    return {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)' },
        path: '/invite/abc123',
        socket: { remoteAddress: '203.0.113.9' },
        ...overrides,
    };
}

/** Captures whatever the middleware writes instead of calling next(). */
function response() {
    const state = {
        body: '',
        status: 0,
        headers: {} as Record<string, string>,
    };
    const res = {
        status(code: number) {
            state.status = code;
            return res;
        },
        set(name: string, value: string) {
            state.headers[name.toLowerCase()] = value;
            return res;
        },
        setHeader(name: string, value: string) {
            state.headers[name.toLowerCase()] = value;
        },
        send(body: string) {
            state.body = body;
            return res;
        },
        end(body?: string) {
            if (body !== undefined) state.body = body;
            return res;
        },
    };
    return { state, res };
}

describe('discordCrawlerPreview', () => {
    let get: jest.SpyInstance;

    afterEach(() => {
        get.mockRestore();
    });

    function serve(icon: string) {
        const bound = repos(icon);
        get = jest
            .spyOn(container, 'get')
            .mockImplementation((token: unknown) => bound[token as symbol]);
        return response();
    }

    it('escapes a server icon that tries to break out of the attribute', async () => {
        const { state, res } = serve(HOSTILE_ICON);
        const next = jest.fn();

        await discordCrawlerPreview(request() as never, res as never, next);

        expect(next).not.toHaveBeenCalled();
        expect(state.body).toContain('og:image');
        expect(state.body).not.toContain('<script>');
        expect(state.body).not.toContain('content=""><script>');
        expect(state.body).toContain('&quot;&gt;&lt;script&gt;');
    });

    it('leaves an ordinary icon url intact', async () => {
        const url = 'https://cdn.example.com/icons/abc123.webp';
        const { state, res } = serve(url);

        await discordCrawlerPreview(
            request() as never,
            res as never,
            jest.fn(),
        );

        expect(state.body).toContain(`content="${url}"`);
    });
});

describe('invite validity is checked, matching GET /api/v1/invites/:code', () => {
    let get: jest.SpyInstance;

    afterEach(() => {
        get.mockRestore();
    });

    function serveInvite(invite: Record<string, unknown>) {
        const bound = {
            [TYPES.InviteRepository]: {
                findByCode: jest.fn().mockResolvedValue(invite),
            },
            [TYPES.VanityLinkRepository]: {
                findByCode: jest.fn().mockResolvedValue(null),
            },
            [TYPES.ServerRepository]: {
                findById: jest.fn().mockResolvedValue({
                    snowflakeId: 'server-1',
                    name: 'Test Server',
                    icon: '',
                }),
            },
            [TYPES.ServerMemberRepository]: {
                countByServerId: jest.fn().mockResolvedValue(3),
            },
        } as Record<symbol, unknown>;
        get = jest
            .spyOn(container, 'get')
            .mockImplementation((token: unknown) => bound[token as symbol]);
        return response();
    }

    it('renders a preview for a usable invite', async () => {
        const usable = { serverId: 'server-1', uses: 0 };
        expect(isInviteUsable(usable)).toBe(true);
        const { state, res } = serveInvite(usable);

        await discordCrawlerPreview(
            request() as never,
            res as never,
            jest.fn(),
        );

        expect(state.status).toBe(200);
        expect(state.body).toContain('Test Server');
    });

    it('falls through instead of rendering a preview for an expired invite', async () => {
        const expired = {
            serverId: 'server-1',
            uses: 0,
            expiresAt: new Date(Date.now() - 60_000),
        };
        expect(isInviteUsable(expired)).toBe(false);
        const { state, res } = serveInvite(expired);
        const next = jest.fn();

        await discordCrawlerPreview(request() as never, res as never, next);

        expect(next).toHaveBeenCalled();
        expect(state.body).toBe('');
    });

    it('falls through instead of rendering a preview for a maxed-out invite', async () => {
        const maxed = { serverId: 'server-1', uses: 5, maxUses: 5 };
        expect(isInviteUsable(maxed)).toBe(false);
        const { state, res } = serveInvite(maxed);
        const next = jest.fn();

        await discordCrawlerPreview(request() as never, res as never, next);

        expect(next).toHaveBeenCalled();
        expect(state.body).toBe('');
    });

    function serveVanityLink(vanityLink: Record<string, unknown>) {
        const bound = {
            [TYPES.InviteRepository]: {
                findByCode: jest.fn().mockResolvedValue(null),
            },
            [TYPES.VanityLinkRepository]: {
                findByCode: jest.fn().mockResolvedValue(vanityLink),
            },
            [TYPES.ServerRepository]: {
                findById: jest.fn().mockResolvedValue({
                    snowflakeId: 'server-1',
                    name: 'Test Server',
                    icon: '',
                }),
            },
            [TYPES.ServerMemberRepository]: {
                countByServerId: jest.fn().mockResolvedValue(3),
            },
        } as Record<symbol, unknown>;
        get = jest
            .spyOn(container, 'get')
            .mockImplementation((token: unknown) => bound[token as symbol]);
        return response();
    }

    it('falls back to a vanity link when no invite matches the code', async () => {
        const { state, res } = serveVanityLink({
            serverId: 'server-1',
            code: 'abc123',
        });

        await discordCrawlerPreview(
            request() as never,
            res as never,
            jest.fn(),
        );

        expect(state.status).toBe(200);
        expect(state.body).toContain('Test Server');
    });
});

describe('the preview path is rate limited', () => {
    let get: jest.SpyInstance;

    beforeEach(() => {
        const bound = repos('');
        get = jest
            .spyOn(container, 'get')
            .mockImplementation((token: unknown) => bound[token as symbol]);
    });

    afterEach(() => {
        get.mockRestore();
    });

    it('answers 429 once a source exceeds the budget, without rendering', async () => {
        const { CRAWLER_PREVIEW_MAX } =
            await import('@/middleware/rateLimiting');
        const source = request({
            socket: {
                remoteAddress: `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
            },
        });

        let lastState: ReturnType<typeof response>['state'] | undefined;
        for (let i = 0; i < CRAWLER_PREVIEW_MAX + 1; i++) {
            const { state, res } = response();
            await discordCrawlerPreview(
                source as never,
                res as never,
                jest.fn(),
            );
            lastState = state;
        }

        expect(lastState?.status).toBe(429);
    });

    it('gives each source its own budget', async () => {
        const { CRAWLER_PREVIEW_MAX } =
            await import('@/middleware/rateLimiting');
        const a = request({ socket: { remoteAddress: '198.51.100.1' } });
        const b = request({ socket: { remoteAddress: '198.51.100.2' } });

        for (let i = 0; i < CRAWLER_PREVIEW_MAX; i++) {
            const { res } = response();
            await discordCrawlerPreview(a as never, res as never, jest.fn());
        }

        const fresh = response();
        await discordCrawlerPreview(b as never, fresh.res as never, jest.fn());

        expect(fresh.state.status).toBe(200);
    });
});
