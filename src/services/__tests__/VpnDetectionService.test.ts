import fs from 'fs';
import { VpnDetectionService } from '../VpnDetectionService';

jest.mock('@/utils/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const VPN_V4 = ['203.0.113.0/24', '198.51.100.5/32'];
const VPN_V6 = ['2001:db8:1::/48'];
const DATACENTER_V4 = ['192.0.2.0/24', '203.0.113.0/24'];
const DATACENTER_V6: string[] = [];

function mockLists(
    existsSync: jest.SpiedFunction<typeof fs.existsSync>,
    readFileSync: jest.SpiedFunction<typeof fs.readFileSync>,
    overrides: Partial<{
        vpnV4: string[];
        vpnV6: string[];
        datacenterV4: string[];
        datacenterV6: string[];
    }> = {},
): void {
    const vpnV4 = overrides.vpnV4 ?? VPN_V4;
    const vpnV6 = overrides.vpnV6 ?? VPN_V6;
    const datacenterV4 = overrides.datacenterV4 ?? DATACENTER_V4;
    const datacenterV6 = overrides.datacenterV6 ?? DATACENTER_V6;

    existsSync.mockReturnValue(true);
    readFileSync.mockImplementation(((filePath: string) => {
        if (filePath.includes('vpn/ipv4')) return vpnV4.join('\n');
        if (filePath.includes('vpn/ipv6')) return vpnV6.join('\n');
        if (filePath.includes('datacenter/ipv4'))
            return datacenterV4.join('\n');
        if (filePath.includes('datacenter/ipv6'))
            return datacenterV6.join('\n');
        return '';
    }) as unknown as typeof fs.readFileSync);
}

function mockFetchLists(
    overrides: Partial<{
        vpnV4: string[];
        vpnV6: string[];
        datacenterV4: string[];
        datacenterV6: string[];
    }> = {},
): jest.Mock {
    const vpnV4 = overrides.vpnV4 ?? VPN_V4;
    const vpnV6 = overrides.vpnV6 ?? VPN_V6;
    const datacenterV4 = overrides.datacenterV4 ?? DATACENTER_V4;
    const datacenterV6 = overrides.datacenterV6 ?? DATACENTER_V6;

    const fetchMock = jest.fn((url: string) => {
        let body = '';
        if (url.includes('vpn/ipv4.txt')) body = vpnV4.join('\n');
        else if (url.includes('vpn/ipv6.txt')) body = vpnV6.join('\n');
        else if (url.includes('datacenter/ipv4.txt'))
            body = datacenterV4.join('\n');
        else if (url.includes('datacenter/ipv6.txt'))
            body = datacenterV6.join('\n');

        return Promise.resolve({
            ok: true,
            status: 200,
            text: () => Promise.resolve(body),
        });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
}

describe('VpnDetectionService', () => {
    let existsSyncSpy: jest.SpiedFunction<typeof fs.existsSync>;
    let readFileSyncSpy: jest.SpiedFunction<typeof fs.readFileSync>;
    let mkdirSyncSpy: jest.SpiedFunction<typeof fs.mkdirSync>;
    let writeFileSyncSpy: jest.SpiedFunction<typeof fs.writeFileSync>;

    beforeEach(() => {
        jest.clearAllMocks();
        existsSyncSpy = jest.spyOn(fs, 'existsSync');
        readFileSyncSpy = jest.spyOn(fs, 'readFileSync');
        mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
        writeFileSyncSpy = jest
            .spyOn(fs, 'writeFileSync')
            .mockReturnValue(undefined);
    });

    afterEach(() => {
        existsSyncSpy.mockRestore();
        readFileSyncSpy.mockRestore();
        mkdirSyncSpy.mockRestore();
        writeFileSyncSpy.mockRestore();
    });

    it('classifies an ipv4 address inside a vpn range', () => {
        mockLists(existsSyncSpy, readFileSyncSpy);
        const service = new VpnDetectionService();

        expect(service.classify('198.51.100.5')).toBe('vpn');
    });

    it('classifies an ipv4 address inside a datacenter-only range', () => {
        mockLists(existsSyncSpy, readFileSyncSpy);
        const service = new VpnDetectionService();

        expect(service.classify('192.0.2.42')).toBe('datacenter');
    });

    it('prefers vpn over datacenter when a range overlaps both lists', () => {
        mockLists(existsSyncSpy, readFileSyncSpy);
        const service = new VpnDetectionService();

        expect(service.classify('203.0.113.42')).toBe('vpn');
    });

    it('classifies an ipv6 address inside a vpn range', () => {
        mockLists(existsSyncSpy, readFileSyncSpy);
        const service = new VpnDetectionService();

        expect(service.classify('2001:db8:1::1')).toBe('vpn');
    });

    it('returns null for an address outside every range', () => {
        mockLists(existsSyncSpy, readFileSyncSpy);
        const service = new VpnDetectionService();

        expect(service.classify('8.8.8.8')).toBeNull();
    });

    it('returns null for an invalid ip string', () => {
        mockLists(existsSyncSpy, readFileSyncSpy);
        const service = new VpnDetectionService();

        expect(service.classify('not-an-ip')).toBeNull();
    });

    it('skips malformed lines without throwing', () => {
        mockLists(existsSyncSpy, readFileSyncSpy, {
            vpnV4: ['not-a-cidr', '203.0.113.0/24'],
        });

        expect(() => new VpnDetectionService()).not.toThrow();
        const service = new VpnDetectionService();
        expect(service.classify('203.0.113.42')).toBe('vpn');
    });

    it('degrades to always-null when the list files are missing', () => {
        existsSyncSpy.mockReturnValue(false);
        readFileSyncSpy.mockReturnValue('');

        const service = new VpnDetectionService();

        expect(service.classify('203.0.113.42')).toBeNull();
        expect(readFileSyncSpy).not.toHaveBeenCalled();
    });

    describe('refresh', () => {
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('replaces ranges with freshly fetched data on the refresh interval', async () => {
            mockLists(existsSyncSpy, readFileSyncSpy);
            const service = new VpnDetectionService();
            expect(service.classify('8.8.8.8')).toBeNull();

            mockFetchLists({ vpnV4: ['8.8.8.0/24'] });
            await jest.advanceTimersByTimeAsync(ONE_DAY_MS);

            expect(service.classify('8.8.8.8')).toBe('vpn');
        });

        it('writes freshly fetched lists back to the local cache files', async () => {
            mockLists(existsSyncSpy, readFileSyncSpy);
            new VpnDetectionService();

            mockFetchLists();
            await jest.advanceTimersByTimeAsync(ONE_DAY_MS);

            expect(writeFileSyncSpy).toHaveBeenCalledWith(
                expect.stringContaining('vpn/ipv4.txt'),
                VPN_V4.join('\n'),
            );
        });

        it('keeps the existing ranges when a scheduled refresh fails', async () => {
            mockLists(existsSyncSpy, readFileSyncSpy);
            const service = new VpnDetectionService();

            global.fetch = jest
                .fn()
                .mockRejectedValue(new Error('network down'));
            await jest.advanceTimersByTimeAsync(ONE_DAY_MS);

            expect(service.classify('198.51.100.5')).toBe('vpn');
        });

        it('onModuleDestroy stops future refreshes', async () => {
            mockLists(existsSyncSpy, readFileSyncSpy);
            const service = new VpnDetectionService();
            const fetchMock = mockFetchLists({ vpnV4: ['8.8.8.0/24'] });

            service.onModuleDestroy();
            await jest.advanceTimersByTimeAsync(ONE_DAY_MS * 3);

            expect(fetchMock).not.toHaveBeenCalled();
        });
    });
});
