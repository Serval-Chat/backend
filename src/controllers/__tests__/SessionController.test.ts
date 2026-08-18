import { NotFoundException } from '@nestjs/common';
import { SessionController } from '../SessionController';
import {
    revokeSessionById,
    revokeAllSessionsForUser,
} from '@/utils/sessionAuth';

jest.mock('@/utils/sessionAuth', () => ({
    revokeSessionById: jest.fn(),
    revokeAllSessionsForUser: jest.fn(),
}));

jest.mock('@/config/env', () => ({
    ...jest.requireActual('@/config/env'),
    PROJECT_LEVEL: 'development',
}));

const mockRevokeSessionById = revokeSessionById as jest.Mock;
const mockRevokeAllSessionsForUser = revokeAllSessionsForUser as jest.Mock;
const mockedEnv: { PROJECT_LEVEL: string } = jest.requireMock('@/config/env');

describe('SessionController', () => {
    const sessionRepo = { findByUser: jest.fn(), updateIp: jest.fn() };
    const geoIpService = { lookup: jest.fn() };
    const vpnDetectionService = { classify: jest.fn() };
    let controller: SessionController;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedEnv.PROJECT_LEVEL = 'development';
        geoIpService.lookup.mockReturnValue(null);
        vpnDetectionService.classify.mockReturnValue(null);
        controller = new SessionController(
            sessionRepo as never,
            geoIpService as never,
            vpnDetectionService as never,
        );
    });

    describe('listSessions', () => {
        it('marks the caller-supplied session as current', async () => {
            sessionRepo.findByUser.mockResolvedValue([
                {
                    snowflakeId: 'session-1',
                    userAgent: 'ua-1',
                    ip: '1.1.1.1',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: new Date('2026-01-02'),
                    expiresAt: new Date('2026-02-01'),
                },
                {
                    snowflakeId: 'session-2',
                    userAgent: 'ua-2',
                    ip: '2.2.2.2',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: new Date('2026-01-02'),
                    expiresAt: new Date('2026-02-01'),
                },
            ]);

            const result = await controller.listSessions('user-1', 'session-2');

            expect(result.sessions).toHaveLength(2);
            expect(
                result.sessions.find((s) => s.id === 'session-1')?.isCurrent,
            ).toBe(false);
            expect(
                result.sessions.find((s) => s.id === 'session-2')?.isCurrent,
            ).toBe(true);
        });

        it('formats a city+country location and omits it when the lookup misses', async () => {
            sessionRepo.findByUser.mockResolvedValue([
                {
                    snowflakeId: 'session-1',
                    userAgent: 'ua-1',
                    ip: '1.1.1.1',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: new Date('2026-01-02'),
                    expiresAt: new Date('2026-02-01'),
                },
                {
                    snowflakeId: 'session-2',
                    userAgent: 'ua-2',
                    ip: '127.0.0.1',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: new Date('2026-01-02'),
                    expiresAt: new Date('2026-02-01'),
                },
            ]);
            geoIpService.lookup.mockImplementation((ip: string) =>
                ip === '1.1.1.1'
                    ? { city: 'Amsterdam', country: 'Netherlands' }
                    : null,
            );

            const result = await controller.listSessions('user-1', undefined);

            expect(
                result.sessions.find((s) => s.id === 'session-1')?.location,
            ).toBe('Amsterdam, Netherlands');
            expect(
                result.sessions.find((s) => s.id === 'session-2')?.location,
            ).toBeUndefined();
        });

        it('surfaces the ip risk classification and omits it when clean', async () => {
            sessionRepo.findByUser.mockResolvedValue([
                {
                    snowflakeId: 'session-1',
                    userAgent: 'ua-1',
                    ip: '1.1.1.1',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: new Date('2026-01-02'),
                    expiresAt: new Date('2026-02-01'),
                },
                {
                    snowflakeId: 'session-2',
                    userAgent: 'ua-2',
                    ip: '2.2.2.2',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: new Date('2026-01-02'),
                    expiresAt: new Date('2026-02-01'),
                },
            ]);
            vpnDetectionService.classify.mockImplementation((ip: string) =>
                ip === '1.1.1.1' ? 'vpn' : null,
            );

            const result = await controller.listSessions('user-1', undefined);

            expect(
                result.sessions.find((s) => s.id === 'session-1')?.ipRisk,
            ).toBe('vpn');
            expect(
                result.sessions.find((s) => s.id === 'session-2')?.ipRisk,
            ).toBeUndefined();
        });
    });

    describe('revokeSession', () => {
        it('throws 404 when the session does not belong to the caller', async () => {
            mockRevokeSessionById.mockResolvedValue(null);

            await expect(
                controller.revokeSession('user-1', 'not-mine'),
            ).rejects.toThrow(NotFoundException);
        });

        it('revokes a session the caller owns', async () => {
            mockRevokeSessionById.mockResolvedValue({
                snowflakeId: 'session-1',
            });

            const result = await controller.revokeSession(
                'user-1',
                'session-1',
            );

            expect(mockRevokeSessionById).toHaveBeenCalledWith(
                'session-1',
                'user-1',
            );
            expect(result.revokedCount).toBe(1);
        });
    });

    describe('revokeOtherSessions', () => {
        it('excepts the current session from revocation', async () => {
            mockRevokeAllSessionsForUser.mockResolvedValue([
                { snowflakeId: 's2' },
                { snowflakeId: 's3' },
            ]);

            const result = await controller.revokeOtherSessions(
                'user-1',
                'session-1',
            );

            expect(mockRevokeAllSessionsForUser).toHaveBeenCalledWith(
                'user-1',
                'session-1',
            );
            expect(result.revokedCount).toBe(2);
        });
    });

    describe('updateSessionIp', () => {
        it('throws 404 without touching the repo when not running in development', async () => {
            mockedEnv.PROJECT_LEVEL = 'release';

            await expect(
                controller.updateSessionIp('user-1', 'session-1', {
                    ip: '1.2.3.4',
                }),
            ).rejects.toThrow(NotFoundException);
            expect(sessionRepo.updateIp).not.toHaveBeenCalled();
        });

        it('throws 404 when the session does not belong to the caller', async () => {
            sessionRepo.updateIp.mockResolvedValue(null);

            await expect(
                controller.updateSessionIp('user-1', 'not-mine', {
                    ip: '1.2.3.4',
                }),
            ).rejects.toThrow(NotFoundException);
        });

        it('updates the ip of a session the caller owns', async () => {
            sessionRepo.updateIp.mockResolvedValue({
                snowflakeId: 'session-1',
                ip: '1.2.3.4',
            });

            const result = await controller.updateSessionIp(
                'user-1',
                'session-1',
                { ip: '1.2.3.4' },
            );

            expect(sessionRepo.updateIp).toHaveBeenCalledWith(
                'session-1',
                'user-1',
                '1.2.3.4',
            );
            expect(result).toEqual({
                message: 'Session IP updated',
                ip: '1.2.3.4',
            });
        });
    });
});
