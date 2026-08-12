import { container } from '@/di/container';
import { TYPES } from '@/di/types';
import { discordCrawlerPreview } from '../crawlerPreview';

const HOSTILE_ICON = '"><script>alert(document.domain)</script><meta x="';

const invite = { serverId: 'server-1' };

function repos(icon: string) {
    return {
        [TYPES.InviteRepository]: {
            findByCodeOrCustomPath: jest.fn().mockResolvedValue(invite),
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

function request() {
    return {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; Discordbot/2.0)' },
        path: '/invite/abc123',
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
