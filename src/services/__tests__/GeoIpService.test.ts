import fs from 'fs';
import maxmind from 'maxmind';
import { GeoIpService } from '../GeoIpService';

jest.mock('maxmind', () => ({
    __esModule: true,
    default: {
        open: jest.fn(),
        validate: jest.fn(),
    },
}));

jest.mock('@/utils/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/config/env', () => ({
    ...jest.requireActual('@/config/env'),
    MAXMIND_LICENSE_KEY: '',
}));

const mockedMaxmind = maxmind as unknown as {
    open: jest.Mock;
    validate: jest.Mock;
};
const mockEnv: { MAXMIND_LICENSE_KEY: string } =
    jest.requireMock('@/config/env');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function stubDownload(service: GeoIpService, impl: jest.Mock): void {
    (service as unknown as { downloadDatabase: jest.Mock }).downloadDatabase =
        impl;
}

describe('GeoIpService', () => {
    let service: GeoIpService;
    let existsSyncSpy: jest.SpiedFunction<typeof fs.existsSync>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockEnv.MAXMIND_LICENSE_KEY = '';
        existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
        service = new GeoIpService();
    });

    afterEach(() => {
        existsSyncSpy.mockRestore();
    });

    describe('ensureDatabase', () => {
        it('skips entirely when no license key is configured', async () => {
            await service.ensureDatabase();

            expect(existsSyncSpy).not.toHaveBeenCalled();
            expect(mockedMaxmind.open).not.toHaveBeenCalled();
        });

        it('opens the database directly when the file already exists', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            mockedMaxmind.open.mockResolvedValue({ get: jest.fn() });

            await service.ensureDatabase();

            expect(mockedMaxmind.open).toHaveBeenCalledTimes(1);
        });

        it('memoizes concurrent calls into a single in-flight attempt', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            mockedMaxmind.open.mockResolvedValue({ get: jest.fn() });

            await Promise.all([
                service.ensureDatabase(),
                service.ensureDatabase(),
            ]);

            expect(mockedMaxmind.open).toHaveBeenCalledTimes(1);
        });
    });

    describe('lookup', () => {
        it('returns null when the database has not been loaded', () => {
            expect(service.lookup('1.2.3.4')).toBeNull();
        });

        it('returns null for an invalid ip without touching the reader', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const fakeReader = { get: jest.fn() };
            mockedMaxmind.open.mockResolvedValue(fakeReader);
            mockedMaxmind.validate.mockReturnValue(false);
            await service.ensureDatabase();

            const result = service.lookup('not-an-ip');

            expect(result).toBeNull();
            expect(fakeReader.get).not.toHaveBeenCalled();
        });

        it('formats city and country when both resolve', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const fakeReader = {
                get: jest.fn().mockReturnValue({
                    city: { names: { en: 'Amsterdam' } },
                    country: { names: { en: 'Netherlands' } },
                }),
            };
            mockedMaxmind.open.mockResolvedValue(fakeReader);
            mockedMaxmind.validate.mockReturnValue(true);
            await service.ensureDatabase();

            expect(service.lookup('1.2.3.4')).toEqual({
                city: 'Amsterdam',
                country: 'Netherlands',
            });
        });

        it('returns country only when the city is missing', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const fakeReader = {
                get: jest.fn().mockReturnValue({
                    country: { names: { en: 'Netherlands' } },
                }),
            };
            mockedMaxmind.open.mockResolvedValue(fakeReader);
            mockedMaxmind.validate.mockReturnValue(true);
            await service.ensureDatabase();

            expect(service.lookup('1.2.3.4')).toEqual({
                city: undefined,
                country: 'Netherlands',
            });
        });

        it('returns null when the ip resolves to neither city nor country', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const fakeReader = { get: jest.fn().mockReturnValue({}) };
            mockedMaxmind.open.mockResolvedValue(fakeReader);
            mockedMaxmind.validate.mockReturnValue(true);
            await service.ensureDatabase();

            expect(service.lookup('1.2.3.4')).toBeNull();
        });

        it('returns null when the reader has no entry for the ip', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const fakeReader = { get: jest.fn().mockReturnValue(null) };
            mockedMaxmind.open.mockResolvedValue(fakeReader);
            mockedMaxmind.validate.mockReturnValue(true);
            await service.ensureDatabase();

            expect(service.lookup('127.0.0.1')).toBeNull();
        });
    });

    describe('refresh', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('re-downloads and re-opens the database on the refresh interval', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const download = jest.fn().mockResolvedValue(undefined);
            stubDownload(service, download);
            mockedMaxmind.open
                .mockResolvedValueOnce({ get: jest.fn() })
                .mockResolvedValueOnce({ get: jest.fn() });

            await service.ensureDatabase();
            expect(mockedMaxmind.open).toHaveBeenCalledTimes(1);
            expect(download).not.toHaveBeenCalled();

            await jest.advanceTimersByTimeAsync(ONE_DAY_MS);

            expect(download).toHaveBeenCalledTimes(1);
            expect(mockedMaxmind.open).toHaveBeenCalledTimes(2);
        });

        it('keeps the existing reader when a scheduled refresh fails', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const staleReader = {
                get: jest.fn().mockReturnValue({
                    country: { names: { en: 'Netherlands' } },
                }),
            };
            mockedMaxmind.open.mockResolvedValueOnce(staleReader);
            mockedMaxmind.validate.mockReturnValue(true);
            stubDownload(
                service,
                jest.fn().mockRejectedValue(new Error('network down')),
            );

            await service.ensureDatabase();
            await jest.advanceTimersByTimeAsync(ONE_DAY_MS);

            expect(service.lookup('1.2.3.4')).toEqual({
                city: undefined,
                country: 'Netherlands',
            });
        });

        it('does not schedule a refresh when no license key is configured', async () => {
            existsSyncSpy.mockReturnValue(true);
            const download = jest.fn().mockResolvedValue(undefined);
            stubDownload(service, download);

            await service.ensureDatabase();
            await jest.advanceTimersByTimeAsync(ONE_DAY_MS * 3);

            expect(download).not.toHaveBeenCalled();
            expect(mockedMaxmind.open).not.toHaveBeenCalled();
        });

        it('onModuleDestroy stops future refreshes', async () => {
            mockEnv.MAXMIND_LICENSE_KEY = 'test-key';
            existsSyncSpy.mockReturnValue(true);
            const download = jest.fn().mockResolvedValue(undefined);
            stubDownload(service, download);
            mockedMaxmind.open.mockResolvedValue({ get: jest.fn() });

            await service.ensureDatabase();
            service.onModuleDestroy();
            await jest.advanceTimersByTimeAsync(ONE_DAY_MS * 3);

            expect(download).not.toHaveBeenCalled();
        });
    });
});
